import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Faturamento, NfData, Obligation, ObligationPatch, ObligationsQuery } from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class ObligationsService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  list(query: ObligationsQuery = {}): Observable<Obligation[]> {
    let params = new HttpParams();
    if (query.tipo) {
      params = params.set('tipo', query.tipo);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }

    return this.http.get<Obligation[]>(`${this.baseUrl}/obligations`, {
      params,
      withCredentials: true,
    });
  }

  getById(id: number): Observable<Obligation> {
    return this.http.get<Obligation>(`${this.baseUrl}/obligations/${id}`, {
      withCredentials: true,
    });
  }

  patch(id: number, changes: ObligationPatch): Observable<Obligation> {
    return this.http.patch<Obligation>(`${this.baseUrl}/obligations/${id}`, changes, {
      withCredentials: true,
    });
  }

  markAsPaid(id: number): Observable<Obligation> {
    return this.patch(id, { status: 'CONCLUIDO' });
  }

  markAsPending(id: number): Observable<Obligation> {
    return this.patch(id, { status: 'PENDENTE' });
  }

  getNfData(id: number): Observable<NfData> {
    return this.http.get<NfData>(`${this.baseUrl}/obligations/${id}/nf-data`, {
      withCredentials: true,
    });
  }

  cancelar(id: number): Observable<Obligation> {
    return this.http.post<Obligation>(`${this.baseUrl}/obligations/${id}/cancelar`, null, {
      withCredentials: true,
    });
  }

  getFaturamento(ano: number): Observable<Faturamento> {
    return this.http.get<Faturamento>(`${this.baseUrl}/obligations/faturamento`, {
      params: { ano },
      withCredentials: true,
    });
  }
}
