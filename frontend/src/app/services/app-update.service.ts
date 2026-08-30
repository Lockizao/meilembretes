import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { interval } from 'rxjs';

/** Duração entre checagens automáticas de nova versão, em ms. O Angular só
 * checa por conta própria uma vez, no registro inicial do service worker -
 * sem isso, um app aberto e esquecido numa aba nunca percebe que existe uma
 * versão mais nova. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Corrige o problema clássico de PWA com service worker: o navegador fica
 * servindo os arquivos antigos em cache até uma nova versão ser buscada E
 * ativada - o que por padrão só acontece na próxima aba/refresh, e às vezes
 * nem isso. Aqui a gente checa periodicamente e, quando uma versão nova está
 * pronta, avisa e recarrega a página sozinho. */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);

  init(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.onVersionReady(event);
      }
    });

    interval(CHECK_INTERVAL_MS).subscribe(() => {
      this.swUpdate.checkForUpdate().catch(() => {
        // Sem rede/offline - tenta de novo no proximo ciclo, sem barulho.
      });
    });
  }

  private onVersionReady(_event: VersionReadyEvent): void {
    const ref = this.snackBar.open('Nova versão disponível.', 'Atualizar', { duration: 10000 });
    ref.onAction().subscribe(() => this.reloadPage());
  }

  /** Isolado num método (em vez de chamar `document.location.reload()` direto
   * no subscribe acima) só pra dar pra substituir em teste - `location.reload`
   * não é redefinível no jsdom. */
  protected reloadPage(): void {
    document.location.reload();
  }
}
