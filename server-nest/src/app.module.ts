import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CloudinaryModule } from './cloudinary/cloudinary.module.js';
import { MailModule } from './mail/mail.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtModule } from '@nestjs/jwt';
import { ProductsModule } from './products/products.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { StripeModule } from './stripe/stripe.module.js';
import { InngestModule } from './inngest/inngest.module.js';
import { AddressesModule } from './addresses/addresses.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { AdminModule } from './admin/admin.module.js';
import { UploadModule } from './upload/upload.module.js';
import { CategoriesModule } from './categories/categories.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
    PrismaModule,
    CloudinaryModule,
    MailModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    OrdersModule,
    StripeModule,
    InngestModule,
    AddressesModule,
    DeliveryModule,
    AdminModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
