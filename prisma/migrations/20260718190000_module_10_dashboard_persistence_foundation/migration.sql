-- CreateEnum
CREATE TYPE "DashboardAudience" AS ENUM ('PERSONAL', 'TENANT_SHARED');

-- CreateEnum
CREATE TYPE "DashboardBreakpoint" AS ENUM ('DESKTOP', 'TABLET', 'MOBILE');

-- CreateEnum
CREATE TYPE "DashboardWidgetKind" AS ENUM ('CARD', 'SWITCH', 'GAUGE', 'CHART', 'MAP', 'TABLE', 'STATUS');

-- CreateEnum
CREATE TYPE "DashboardBindingIntent" AS ENUM ('READ', 'REPORT', 'WRITE');

-- CreateEnum
CREATE TYPE "DashboardBindingMode" AS ENUM ('DEVICE_STATUS', 'LATEST', 'HISTORY', 'AGGREGATE', 'COMMAND');

-- Supporting composite uniqueness for tenant-aware foreign keys
CREATE UNIQUE INDEX "memberships_id_tenantId_key" ON "memberships"("id", "tenantId");
CREATE UNIQUE INDEX "devices_id_tenantId_key" ON "devices"("id", "tenantId");
CREATE UNIQUE INDEX "capabilities_id_deviceId_key" ON "capabilities"("id", "deviceId");

-- CreateTable
CREATE TABLE "dashboards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerMembershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audience" "DashboardAudience" NOT NULL DEFAULT 'PERSONAL',
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "breakpoint" "DashboardBreakpoint" NOT NULL,
    "columns" INTEGER NOT NULL,
    "rowHeight" INTEGER NOT NULL,
    "gap" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "kind" "DashboardWidgetKind" NOT NULL,
    "title" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "presentationConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layout_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "minWidth" INTEGER,
    "minHeight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_layout_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widget_bindings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "intent" "DashboardBindingIntent" NOT NULL,
    "mode" "DashboardBindingMode" NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capabilityId" TEXT,
    "queryConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_widget_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboards_id_tenantId_key" ON "dashboards"("id", "tenantId");
CREATE INDEX "dashboards_tenantId_ownerMembershipId_idx" ON "dashboards"("tenantId", "ownerMembershipId");
CREATE INDEX "dashboards_tenantId_audience_idx" ON "dashboards"("tenantId", "audience");

CREATE UNIQUE INDEX "dashboard_layouts_id_tenantId_key" ON "dashboard_layouts"("id", "tenantId");
CREATE UNIQUE INDEX "dashboard_layouts_dashboardId_breakpoint_key" ON "dashboard_layouts"("dashboardId", "breakpoint");
CREATE INDEX "dashboard_layouts_tenantId_dashboardId_idx" ON "dashboard_layouts"("tenantId", "dashboardId");

CREATE UNIQUE INDEX "dashboard_widgets_id_tenantId_key" ON "dashboard_widgets"("id", "tenantId");
CREATE INDEX "dashboard_widgets_tenantId_dashboardId_idx" ON "dashboard_widgets"("tenantId", "dashboardId");

CREATE UNIQUE INDEX "dashboard_layout_items_layoutId_widgetId_key" ON "dashboard_layout_items"("layoutId", "widgetId");
CREATE INDEX "dashboard_layout_items_tenantId_layoutId_idx" ON "dashboard_layout_items"("tenantId", "layoutId");
CREATE INDEX "dashboard_layout_items_tenantId_widgetId_idx" ON "dashboard_layout_items"("tenantId", "widgetId");

CREATE UNIQUE INDEX "dashboard_widget_bindings_widgetId_alias_key" ON "dashboard_widget_bindings"("widgetId", "alias");
CREATE INDEX "dashboard_widget_bindings_tenantId_widgetId_idx" ON "dashboard_widget_bindings"("tenantId", "widgetId");
CREATE INDEX "dashboard_widget_bindings_tenantId_deviceId_idx" ON "dashboard_widget_bindings"("tenantId", "deviceId");
CREATE INDEX "dashboard_widget_bindings_capabilityId_deviceId_idx" ON "dashboard_widget_bindings"("capabilityId", "deviceId");

-- AddForeignKey
ALTER TABLE "dashboards"
ADD CONSTRAINT "dashboards_ownerMembershipId_tenantId_fkey"
FOREIGN KEY ("ownerMembershipId", "tenantId")
REFERENCES "memberships"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dashboard_layouts"
ADD CONSTRAINT "dashboard_layouts_dashboardId_tenantId_fkey"
FOREIGN KEY ("dashboardId", "tenantId")
REFERENCES "dashboards"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_widgets"
ADD CONSTRAINT "dashboard_widgets_dashboardId_tenantId_fkey"
FOREIGN KEY ("dashboardId", "tenantId")
REFERENCES "dashboards"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_layout_items"
ADD CONSTRAINT "dashboard_layout_items_layoutId_tenantId_fkey"
FOREIGN KEY ("layoutId", "tenantId")
REFERENCES "dashboard_layouts"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_layout_items"
ADD CONSTRAINT "dashboard_layout_items_widgetId_tenantId_fkey"
FOREIGN KEY ("widgetId", "tenantId")
REFERENCES "dashboard_widgets"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_widget_bindings"
ADD CONSTRAINT "dashboard_widget_bindings_widgetId_tenantId_fkey"
FOREIGN KEY ("widgetId", "tenantId")
REFERENCES "dashboard_widgets"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_widget_bindings"
ADD CONSTRAINT "dashboard_widget_bindings_deviceId_tenantId_fkey"
FOREIGN KEY ("deviceId", "tenantId")
REFERENCES "devices"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dashboard_widget_bindings"
ADD CONSTRAINT "dashboard_widget_bindings_capabilityId_deviceId_fkey"
FOREIGN KEY ("capabilityId", "deviceId")
REFERENCES "capabilities"("id", "deviceId")
ON DELETE RESTRICT ON UPDATE CASCADE;
