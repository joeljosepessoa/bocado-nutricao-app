import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const BCRYPT_COST = 12;

// Hash bcrypt válido de um valor fixo e sem significado — usado só para dar
// ao bcrypt.compare() um trabalho real de mesma duração quando o e-mail
// informado no login não existe, evitando que o tempo de resposta revele isso.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5b6NAhKu0kA5tOhI.tRTU2wNiTB0uSK';

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  compareAgainstDummy(): Promise<boolean> {
    return bcrypt.compare(randomBytes(16).toString('hex'), DUMMY_HASH);
  }

  generateTemporaryPassword(): string {
    return randomBytes(9).toString('base64url');
  }
}
