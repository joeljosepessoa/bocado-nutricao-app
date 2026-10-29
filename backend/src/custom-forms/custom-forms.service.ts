import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { answeredCount, normalizeAnswers, normalizeQuestions, type Answers, type FormQuestion } from './custom-form-rules';
import { CreateCustomFormDto, CreateFormResponseDto, UpdateCustomFormDto, UpdateFormResponseDto } from './dto/custom-form.dto';

const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Formulários próprios do profissional e as respostas preenchidas por ele no painel, por paciente.
 * Tudo isolado por profissional; a resposta guarda nome e perguntas do momento do preenchimento.
 */
@Injectable()
export class CustomFormsService {
  constructor(private readonly prisma: PrismaService) {}

  private validQuestions(input: unknown): FormQuestion[] {
    const { questions, problems } = normalizeQuestions(input);
    if (problems.length > 0) throw new BadRequestException(problems.slice(0, 6).join(' '));
    return questions;
  }

  private async ownedForm(professionalId: string, id: string, includeDeleted = false) {
    const form = await this.prisma.customForm.findFirst({ where: { id, professionalId, ...(includeDeleted ? {} : { deletedAt: null }) } });
    if (!form) throw new NotFoundException('Formulário não encontrado.');
    return form;
  }

  private async assertOwnedClient(professionalId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, professionalId }, select: { id: true } });
    if (!client) throw new NotFoundException('Paciente não encontrado.');
  }

  // --- Formulários -------------------------------------------------------------

  async list(professionalId: string, trash = false) {
    const forms = await this.prisma.customForm.findMany({
      where: { professionalId, deletedAt: trash ? { not: null } : null },
      orderBy: [{ updatedAt: 'desc' }],
      include: { _count: { select: { responses: true } } },
    });
    return forms.map(({ _count, questions, ...form }) => ({
      ...form,
      questionCount: Array.isArray(questions) ? questions.length : 0,
      responseCount: _count.responses,
    }));
  }

  async get(professionalId: string, id: string) {
    return this.ownedForm(professionalId, id, true);
  }

  async create(professionalId: string, dto: CreateCustomFormDto) {
    const questions = this.validQuestions(dto.questions);
    return this.prisma.customForm.create({
      data: { professionalId, name: dto.name.trim(), description: dto.description?.trim() || null, questions: json(questions) },
    });
  }

  async update(professionalId: string, id: string, dto: UpdateCustomFormDto) {
    await this.ownedForm(professionalId, id);
    const questions = dto.questions !== undefined ? this.validQuestions(dto.questions) : undefined;
    return this.prisma.customForm.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(questions ? { questions: json(questions) } : {}),
      },
    });
  }

  async duplicate(professionalId: string, id: string) {
    const form = await this.ownedForm(professionalId, id, true);
    return this.prisma.customForm.create({
      data: { professionalId, name: `${form.name} (cópia)`.slice(0, 120), description: form.description, questions: json(form.questions) },
    });
  }

  /** Lixeira: some da lista, mas as respostas já dadas continuam. */
  async remove(professionalId: string, id: string) {
    await this.ownedForm(professionalId, id);
    await this.prisma.customForm.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async restore(professionalId: string, id: string) {
    await this.ownedForm(professionalId, id, true);
    return this.prisma.customForm.update({ where: { id }, data: { deletedAt: null } });
  }

  // --- Respostas por paciente -------------------------------------------------

  async listResponses(professionalId: string, clientId: string) {
    await this.assertOwnedClient(professionalId, clientId);
    const rows = await this.prisma.customFormResponse.findMany({
      where: { clientId, professionalId },
      orderBy: [{ filledAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(({ questions, answers, ...row }) => {
      const qs = questions as unknown as FormQuestion[];
      return { ...row, questionCount: qs.length, answeredCount: answeredCount(qs, answers as unknown as Answers) };
    });
  }

  private async ownedResponse(professionalId: string, clientId: string, id: string) {
    const row = await this.prisma.customFormResponse.findFirst({ where: { id, clientId, professionalId } });
    if (!row) throw new NotFoundException('Resposta não encontrada.');
    return row;
  }

  async getResponse(professionalId: string, clientId: string, id: string) {
    await this.assertOwnedClient(professionalId, clientId);
    return this.ownedResponse(professionalId, clientId, id);
  }

  async createResponse(professionalId: string, clientId: string, dto: CreateFormResponseDto) {
    await this.assertOwnedClient(professionalId, clientId);
    const form = await this.ownedForm(professionalId, dto.formId);
    const questions = form.questions as unknown as FormQuestion[];
    const { answers, problems } = normalizeAnswers(questions, dto.answers);
    if (problems.length > 0) throw new BadRequestException(problems.slice(0, 6).join(' '));
    return this.prisma.customFormResponse.create({
      data: {
        formId: form.id,
        clientId,
        professionalId,
        formName: form.name,
        questions: json(questions),
        answers: json(answers),
        ...(dto.filledAt ? { filledAt: new Date(dto.filledAt) } : {}),
      },
    });
  }

  /** Corrige respostas: valem as perguntas gravadas nesta resposta, não as atuais do formulário. */
  async updateResponse(professionalId: string, clientId: string, id: string, dto: UpdateFormResponseDto) {
    await this.assertOwnedClient(professionalId, clientId);
    const row = await this.ownedResponse(professionalId, clientId, id);
    let answers: Answers | undefined;
    if (dto.answers !== undefined) {
      const result = normalizeAnswers(row.questions as unknown as FormQuestion[], dto.answers);
      if (result.problems.length > 0) throw new BadRequestException(result.problems.slice(0, 6).join(' '));
      answers = result.answers;
    }
    return this.prisma.customFormResponse.update({
      where: { id },
      data: { ...(answers ? { answers: json(answers) } : {}), ...(dto.filledAt ? { filledAt: new Date(dto.filledAt) } : {}) },
    });
  }

  async removeResponse(professionalId: string, clientId: string, id: string) {
    await this.assertOwnedClient(professionalId, clientId);
    await this.ownedResponse(professionalId, clientId, id);
    await this.prisma.customFormResponse.delete({ where: { id } });
  }

  // --- LGPD -------------------------------------------------------------------

  /** Exportação de dados do paciente: formulários preenchidos sobre ele (nome, data, perguntas e respostas). */
  async exportForClient(clientId: string) {
    const rows = await this.prisma.customFormResponse.findMany({ where: { clientId }, orderBy: { filledAt: 'asc' } });
    return rows.map((r) => ({ formName: r.formName, filledAt: r.filledAt.toISOString(), questions: r.questions, answers: r.answers }));
  }

  /** Exclusão de conta: as respostas (dados de saúde) são apagadas junto. */
  async deleteForClient(clientId: string): Promise<void> {
    await this.prisma.customFormResponse.deleteMany({ where: { clientId } });
  }
}
