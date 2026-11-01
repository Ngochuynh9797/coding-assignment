import { Module } from '@nestjs/common';
import { UnitConverter } from './unit-converter';
import { WEIGHT_UNITS, WEIGHT_UNITS_TOKEN } from './unit.registry';

@Module({
  providers: [{ provide: WEIGHT_UNITS_TOKEN, useValue: WEIGHT_UNITS }, UnitConverter],
  exports: [UnitConverter],
})
export class UnitsModule {}
