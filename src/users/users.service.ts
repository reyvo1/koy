import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        tenantId: true,
        isVerified: true,
        memberships: {
          select: {
            tenantId: true,
            role: true,
            status: true
          }
        }
      }
    });
  }

  async updateProfile(userId: string, data: { name: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: data.name },
      select: {
        id: true,
        email: true,
        name: true,
      }
    });
  }
}
