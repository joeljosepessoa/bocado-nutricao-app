export enum Role {
  PROFESSIONAL = 'professional',
  CLIENT = 'client',
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}
