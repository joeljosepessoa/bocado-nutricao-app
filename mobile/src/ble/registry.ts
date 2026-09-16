import type { BleAdvertisement, WearableDriver, WearableDriverDescriptor } from './types';

/**
 * Mesmo papel do ScaleDriverRegistry da Fase 10 — classe própria e
 * instância própria deste app, nunca a mesma instância nem importada de
 * `professional-mobile`. Preparado para N fabricantes/modelos de wearable;
 * ao final desta fase só o driver de Heart Rate Service (padrão Bluetooth
 * SIG) está registrado.
 */
export class WearableDriverRegistry {
  private readonly drivers: WearableDriver[] = [];

  register(driver: WearableDriver): void {
    this.drivers.push(driver);
  }

  findMatchingDriver(advertisement: BleAdvertisement): WearableDriver | null {
    return this.drivers.find((driver) => driver.matches(advertisement)) ?? null;
  }

  listSupported(): WearableDriverDescriptor[] {
    return this.drivers.map(({ id, manufacturer, model, protocolVersion, capabilities }) => ({
      id,
      manufacturer,
      model,
      protocolVersion,
      capabilities,
    }));
  }
}
