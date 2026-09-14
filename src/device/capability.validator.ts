import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { Capability } from '@prisma/client';

@Injectable()
export class CapabilityValidator {
  validateValue(value: any, capability: Capability) {
    const { dataType, constraints } = capability;
    const c = (constraints as any) || {};

    switch (dataType) {
      case 'boolean':
        if (typeof value !== 'boolean')
          throw new DomainBadRequestException(
            ERROR_CODES.CapabilityValidationFailed,
            `Capability ${capability.key} expects boolean`,
          );
        break;
      case 'integer':
        if (!Number.isInteger(value))
          throw new DomainBadRequestException(
            ERROR_CODES.CapabilityValidationFailed,
            `Capability ${capability.key} expects integer`,
          );
        this.checkNumericConstraints(value, c, capability.key);
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value))
          throw new DomainBadRequestException(
            ERROR_CODES.CapabilityValidationFailed,
            `Capability ${capability.key} expects finite number`,
          );
        this.checkNumericConstraints(value, c, capability.key);
        break;
      case 'string':
        if (typeof value !== 'string')
          throw new DomainBadRequestException(
            ERROR_CODES.CapabilityValidationFailed,
            `Capability ${capability.key} expects string`,
          );
        break;
      case 'enum':
        if (
          !c.enumValues ||
          !Array.isArray(c.enumValues) ||
          !c.enumValues.includes(value)
        ) {
          throw new DomainBadRequestException(
            ERROR_CODES.CapabilityValidationFailed,
            `Capability ${capability.key} expects value from enum`,
          );
        }
        break;
      case 'object':
        if (
          typeof value !== 'object' ||
          value === null ||
          Array.isArray(value)
        ) {
          throw new DomainBadRequestException(
            ERROR_CODES.CapabilityValidationFailed,
            `Capability ${capability.key} expects object`,
          );
        }
        break;
      default:
        throw new DomainBadRequestException(
          ERROR_CODES.CapabilityValidationFailed,
          `Unsupported dataType: ${dataType}`,
        );
    }
  }

  validateSchema(capability: any) {
    const { key, semanticType, schemaVersion, dataType, constraints } =
      capability;
    if (!key || typeof key !== 'string' || key.trim() === '')
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'Key must be non-empty string',
      );
    if (
      !semanticType ||
      typeof semanticType !== 'string' ||
      semanticType.trim() === ''
    )
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'SemanticType must be non-empty string',
      );
    if (
      schemaVersion !== undefined &&
      (typeof schemaVersion !== 'string' || schemaVersion.trim() === '')
    )
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'SchemaVersion must be non-empty string',
      );

    const c = constraints || {};
    const allowedKeys = {
      boolean: [],
      integer: ['min', 'max'],
      number: ['min', 'max', 'precision'],
      string: [],
      enum: ['enumValues'],
      object: [],
    };

    if (!(dataType in allowedKeys))
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        `Unsupported dataType: ${dataType}`,
      );
    const allowedForType = allowedKeys[dataType as keyof typeof allowedKeys];

    for (const key of Object.keys(c)) {
      if (!allowedForType.includes(key))
        throw new DomainBadRequestException(
          ERROR_CODES.CapabilityValidationFailed,
          `Constraint ${key} not allowed for dataType ${dataType}`,
        );
    }

    switch (dataType) {
      case 'integer':
        this.validateNumericSchema(c, true);
        break;
      case 'number':
        this.validateNumericSchema(c, false);
        break;
      case 'enum':
        this.validateEnumSchema(c.enumValues);
        break;
    }
  }

  private validateNumericSchema(c: any, isInteger: boolean) {
    if (
      c.min !== undefined &&
      (typeof c.min !== 'number' ||
        !Number.isFinite(c.min) ||
        (isInteger && !Number.isInteger(c.min)))
    )
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'Invalid min constraint',
      );
    if (
      c.max !== undefined &&
      (typeof c.max !== 'number' ||
        !Number.isFinite(c.max) ||
        (isInteger && !Number.isInteger(c.max)))
    )
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'Invalid max constraint',
      );
    if (c.min !== undefined && c.max !== undefined && c.min > c.max)
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'min cannot exceed max',
      );

    if (
      !isInteger &&
      c.precision !== undefined &&
      (typeof c.precision !== 'number' ||
        !Number.isFinite(c.precision) ||
        !Number.isInteger(c.precision) ||
        c.precision < 0)
    ) {
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'Invalid precision constraint',
      );
    }
  }

  private validateEnumSchema(enumValues: any) {
    if (!enumValues || !Array.isArray(enumValues) || enumValues.length === 0)
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'enumValues required as non-empty array',
      );
    if (new Set(enumValues).size !== enumValues.length)
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'enumValues cannot contain duplicates',
      );

    const types = new Set(enumValues.map((v) => typeof v));
    if (types.size > 1)
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'Enum values must be of consistent primitive type',
      );

    const type = typeof enumValues[0];
    if (type !== 'string' && type !== 'number' && type !== 'boolean')
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        'Enum values must be string, number, or boolean',
      );

    for (const v of enumValues) {
      if (v === null || Number.isNaN(v) || v === Infinity || v === -Infinity)
        throw new DomainBadRequestException(
          ERROR_CODES.CapabilityValidationFailed,
          'Invalid enum value',
        );
    }
  }

  private checkNumericConstraints(
    value: number,
    constraints: any,
    key: string,
  ) {
    if (constraints.min !== undefined && value < constraints.min)
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        `Value for ${key} below min`,
      );
    if (constraints.max !== undefined && value > constraints.max)
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityValidationFailed,
        `Value for ${key} above max`,
      );
    if (constraints.precision !== undefined) {
      const factor = Math.pow(10, constraints.precision);
      const rounded = Math.round(value * factor) / factor;
      if (Math.abs(value - rounded) > Number.EPSILON)
        throw new DomainBadRequestException(
          ERROR_CODES.CapabilityValidationFailed,
          `Value for ${key} exceeds precision ${constraints.precision}`,
        );
    }
  }
}
