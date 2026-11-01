import { Global, Inject, Module } from '@nestjs/common';
import { parseEnv } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

export const InjectAppConfig = (): ParameterDecorator => Inject(APP_CONFIG);

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => parseEnv(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
