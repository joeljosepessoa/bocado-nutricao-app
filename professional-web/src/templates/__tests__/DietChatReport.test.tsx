import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DietChatResult } from '../../types/api';
import { dietReportOf } from '../chatHelpers';
import { DietChatReport } from '../DietChatReport';

const result: DietChatResult = {
  reply: 'Montei.',
  changed: true,
  warnings: [],
  content: null,
  foods: [],
  nutrition: [],
  targets: { kcal: 3200, proteinG: 220, carbG: 400, fatG: 70, calculation: 'Proteína: 2,2 g/kg × 100 kg = 220 g' },
  revised: true,
  report: [
    {
      label: null,
      partial: false,
      total: { kcal: 3360, proteinG: 230, carbG: 404, fatG: 62 },
      meals: [
        {
          name: 'Café da manhã',
          kcal: 612,
          proteinG: 45,
          carbG: 92,
          fatG: 10,
          partial: false,
          options: [
            { label: 'Opção 1', kcal: 612, diffPercent: 0, foods: ['Aveia', 'Whey', 'Banana'] },
            { label: 'Opção 2', kcal: 575, diffPercent: -6, foods: ['Pão integral', 'Ovo'] },
          ],
        },
        { name: 'Jantar', kcal: 2748, proteinG: 185, carbG: 312, fatG: 52, partial: false, options: [] },
      ],
    },
  ],
};

describe('conferência da dieta no chat', () => {
  it('mostra metas, conta, refeições com opções, total, meta e diferença', () => {
    const report = dietReportOf(result)!;
    render(<DietChatReport report={report} />);
    expect(screen.getByText('3.200 kcal · P 220 g · C 400 g · G 70 g')).toBeInTheDocument();
    expect(screen.getByText('Proteína: 2,2 g/kg × 100 kg = 220 g')).toBeInTheDocument();
    expect(screen.getByText(/Opção 2: 575 kcal \(−6%\) — Pão integral \+ Ovo/)).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Conferência da dieta' });
    const rows = within(table).getAllByRole('row').map((r) => r.textContent);
    expect(rows.at(-3)).toBe('Total (1ª opção)3.360230 g404 g62 g');
    expect(rows.at(-2)).toBe('Meta3.200220 g400 g70 g');
    expect(rows.at(-1)).toBe('Diferença+5%+5%+1%−11%');
    expect(screen.getByText(/corrigidas numa 2ª conferência/)).toBeInTheDocument();
  });

  it('sem mudança na dieta ou sem conferência do servidor: nada de tabela', () => {
    expect(dietReportOf({ ...result, changed: false })).toBeNull();
    expect(dietReportOf({ ...result, report: undefined })).toBeNull();
  });
});
