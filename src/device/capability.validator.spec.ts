import { Test, TestingModule } from '@nestjs/testing';
import { CapabilityValidator } from './capability.validator';
import { BadRequestException } from '@nestjs/common';

describe('CapabilityValidator', () => {
  let validator: CapabilityValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CapabilityValidator],
    }).compile();
    validator = module.get<CapabilityValidator>(CapabilityValidator);
  });

  describe('validateSchema', () => {
    it('should validate valid integer schema', () => {
      expect(() =>
        validator.validateSchema({
          key: 'temp',
          semanticType: 'temperature',
          dataType: 'integer',
          constraints: { min: 0, max: 100 },
        }),
      ).not.toThrow();
    });

    it('should reject integer with precision', () => {
      expect(() =>
        validator.validateSchema({
          key: 'temp',
          semanticType: 'temperature',
          dataType: 'integer',
          constraints: { min: 0, max: 100, precision: 2 },
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject enum missing enumValues', () => {
      expect(() =>
        validator.validateSchema({
          key: 'mode',
          semanticType: 'mode',
          dataType: 'enum',
          constraints: {},
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject duplicate enum values', () => {
      expect(() =>
        validator.validateSchema({
          key: 'mode',
          semanticType: 'mode',
          dataType: 'enum',
          constraints: { enumValues: ['a', 'a'] },
        }),
      ).toThrow(BadRequestException);
    });
    it('should reject negative number precision', () => {
      expect(() =>
        validator.validateSchema({
          key: 'temp',
          semanticType: 'temperature',
          dataType: 'number',
          constraints: { precision: -1 },
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject fractional number precision', () => {
      expect(() =>
        validator.validateSchema({
          key: 'temp',
          semanticType: 'temperature',
          dataType: 'number',
          constraints: { precision: 1.5 },
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject non-finite number precision', () => {
      expect(() =>
        validator.validateSchema({
          key: 'temp',
          semanticType: 'temperature',
          dataType: 'number',
          constraints: { precision: Number.POSITIVE_INFINITY },
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('validateValue', () => {
    it('should validate valid integer', () => {
      const cap = {
        key: 'temp',
        dataType: 'integer',
        constraints: { min: 0, max: 100 },
      } as any;
      expect(() => validator.validateValue(50, cap)).not.toThrow();
    });

    it('should reject integer below min', () => {
      const cap = {
        key: 'temp',
        dataType: 'integer',
        constraints: { min: 0, max: 100 },
      } as any;
      expect(() => validator.validateValue(-1, cap)).toThrow(
        BadRequestException,
      );
    });
  });
});
