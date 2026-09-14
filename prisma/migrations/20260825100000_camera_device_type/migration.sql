-- Add CAMERA to device_type enum (additive, ASCII only).
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'CAMERA';
