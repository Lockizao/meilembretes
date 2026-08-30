import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TourService, TourStep } from './tour.service';

describe('TourService', () => {
  let service: TourService;

  const steps: TourStep[] = [
    { title: 'Passo 1', description: 'Descrição 1' },
    { selector: '[data-tour="x"]', title: 'Passo 2', description: 'Descrição 2' },
  ];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TourService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts inactive with no steps', () => {
    expect(service.active()).toBe(false);
    expect(service.steps()).toEqual([]);
  });

  it('start() activates the tour at step 0', () => {
    service.start('meu-tour', steps);

    expect(service.active()).toBe(true);
    expect(service.steps()).toEqual(steps);
    expect(service.stepIndex()).toBe(0);
  });

  it('start() with an empty step list does nothing', () => {
    service.start('meu-tour', []);

    expect(service.active()).toBe(false);
  });

  it('next() advances the step index', () => {
    service.start('meu-tour', steps);

    service.next();

    expect(service.stepIndex()).toBe(1);
    expect(service.active()).toBe(true);
  });

  it('next() on the last step finishes the tour and marks it as seen', () => {
    service.start('meu-tour', steps);
    service.next(); // vai pro ultimo passo

    service.next(); // tenta avancar de novo - deve concluir

    expect(service.active()).toBe(false);
    expect(service.hasSeen('meu-tour')).toBe(true);
  });

  it('prev() goes back a step without going below zero', () => {
    service.start('meu-tour', steps);
    service.next();

    service.prev();
    expect(service.stepIndex()).toBe(0);

    service.prev();
    expect(service.stepIndex()).toBe(0);
  });

  it('skip() closes the tour WITHOUT marking it as seen', () => {
    service.start('meu-tour', steps);

    service.skip();

    expect(service.active()).toBe(false);
    expect(service.hasSeen('meu-tour')).toBe(false);
  });

  it('hasSeen() is false for a tour never started', () => {
    expect(service.hasSeen('nunca-visto')).toBe(false);
  });
});
