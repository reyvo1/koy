export interface DashboardTenantContext {
  tenantId: string;
  membershipId: string;
  role: string;
  /** Trusted JWT subject. Required for MEMBER device authorization. */
  userId?: string;
}

export interface DashboardRequestUser {
  userId: string;
  tenantContext: DashboardTenantContext;
}

export interface DashboardRequest {
  user: DashboardRequestUser;
}
