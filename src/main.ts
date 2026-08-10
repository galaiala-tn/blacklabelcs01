import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody:true keeps req.rawBody available (needed to verify the Stripe
  // webhook signature) while still parsing JSON normally everywhere else.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string[]>('corsOrigins')?.length ? config.get<string[]>('corsOrigins') : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`BlackLabel API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
