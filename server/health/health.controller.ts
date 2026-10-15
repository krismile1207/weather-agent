import { Controller, Get } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(): Promise<{ status: "ok" }> {
    await this.database.query("SELECT 1");
    return { status: "ok" };
  }
}
