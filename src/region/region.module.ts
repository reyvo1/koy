import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RegionAssignmentService } from './region-assignment.service';

/**
 * Wave 12 — region boundaries (ADR-009).
 *
 * Regions are platform-scoped; the service's device lookups are tenant-scoped, so this module exposes the
 * assignment path without introducing a platform-wide device view.
 */
@Module({
  imports: [PrismaModule],
  providers: [RegionAssignmentService],
  exports: [RegionAssignmentService],
})
export class RegionModule {}