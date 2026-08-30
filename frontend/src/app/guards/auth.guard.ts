import { CanActivateFn } from '@angular/router';

/**
 * Escolha de design (Fase 1 / MVP):
 *
 * O cookie de sessão é httpOnly, então o front não tem como ler/validar o
 * token no lado do cliente antes de navegar. O contrato de API não expõe um
 * endpoint tipo `/auth/me` para checagem leve, e inventar um novo endpoint
 * está fora do escopo deste front.
 *
 * Por isso o guard aqui não bloqueia a navegação: cada página protegida
 * (`/dashboard`, `/settings`) já dispara suas próprias chamadas de
 * carregamento assim que é montada, e o `authInterceptor` intercepta
 * qualquer resposta 401 dessas chamadas e redireciona para `/login`.
 *
 * O guard fica registrado nas rotas (documentando a intenção de proteção e
 * servindo de ponto único de extensão caso o backend passe a expor um
 * endpoint de verificação de sessão no futuro).
 */
export const authGuard: CanActivateFn = () => {
  return true;
};
