import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ModelsController } from "./models.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [ModelsController],
})
export class ModelsModule {}
