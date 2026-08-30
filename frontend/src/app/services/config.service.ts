import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { DasConfig, DasnSimeiConfig, NfConfig, RtRecebimentoConfig } from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getDasConfig(): Observable<DasConfig> {
    return this.http.get<DasConfig>(`${this.baseUrl}/config/das`, {
      withCredentials: true,
    });
  }

  updateDasConfig(config: DasConfig): Observable<DasConfig> {
    return this.http.put<DasConfig>(`${this.baseUrl}/config/das`, config, {
      withCredentials: true,
    });
  }

  getNfConfig(): Observable<NfConfig> {
    return this.http.get<NfConfig>(`${this.baseUrl}/config/nf`, {
      withCredentials: true,
    });
  }

  updateNfConfig(config: NfConfig): Observable<NfConfig> {
    return this.http.put<NfConfig>(`${this.baseUrl}/config/nf`, config, {
      withCredentials: true,
    });
  }

  getRtRecebimentoConfig(): Observable<RtRecebimentoConfig> {
    return this.http.get<RtRecebimentoConfig>(`${this.baseUrl}/config/rt-recebimento`, {
      withCredentials: true,
    });
  }

  updateRtRecebimentoConfig(config: RtRecebimentoConfig): Observable<RtRecebimentoConfig> {
    return this.http.put<RtRecebimentoConfig>(`${this.baseUrl}/config/rt-recebimento`, config, {
      withCredentials: true,
    });
  }

  getDasnSimeiConfig(): Observable<DasnSimeiConfig> {
    return this.http.get<DasnSimeiConfig>(`${this.baseUrl}/config/dasn-simei`, {
      withCredentials: true,
    });
  }

  updateDasnSimeiConfig(config: DasnSimeiConfig): Observable<DasnSimeiConfig> {
    return this.http.put<DasnSimeiConfig>(`${this.baseUrl}/config/dasn-simei`, config, {
      withCredentials: true,
    });
  }
}
