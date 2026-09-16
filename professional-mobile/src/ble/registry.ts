import type { BleAdvertisement, ScaleDriver, ScaleDriverDescriptor } from './types';

/**
 * Arquitetura preparada para N fabricantes/modelos (§08 do desenho). Ao
 * final da Fase 10 o registry é usado só com o MockScaleDriver nos testes
 * e na tela de conexão — nenhum driver de fabricante real foi criado, por
 * falta de protocolo real conhecido (regra fundamental do pedido).
 */
export class ScaleDriverRegistry {
  private readonly drivers: ScaleDriver[] = [];

  register(driver: ScaleDriver): void {
    this.drivers.push(driver);
  }

  /** Primeiro driver, na ordem de registro, cujo matches() aceita o anúncio. */
  findMatchingDriver(advertisement: BleAdvertisement): ScaleDriver | null {
    return this.drivers.find((driver) => driver.matches(advertisement)) ?? null;
  }

  listSupported(): ScaleDriverDescriptor[] {
    return this.drivers.map(({ id, manufacturer, model, protocolVersion, capabilities }) => ({
      id,
      manufacturer,
      model,
      protocolVersion,
      capabilities,
    }));
  }
}
