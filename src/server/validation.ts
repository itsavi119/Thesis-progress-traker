import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, 'Group name must be at least 2 characters'),
  studyTitle: z.string().trim().min(2, 'Study title must be at least 2 characters'),
  studyType: z.string().optional(),
  subjectTerminology: z.string().optional(),
  targetSampleSize: z.number().int().positive('Target sample size must be a positive integer'),
  description: z.string().trim().optional(),
  institution: z.string().trim().optional(),
  organizationId: z.string().trim().optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(2).optional(),
  studyTitle: z.string().trim().min(2).optional(),
  description: z.string().trim().optional(),
  institution: z.string().trim().optional(),
  targetSampleSize: z.number().int().positive().optional(),
  studyType: z.string().optional(),
  subjectTerminology: z.string().optional(),
});

export const registerCaseSchema = z.object({
  patientId: z.string().trim().min(1, 'Patient ID is required'),
  patientName: z.string().trim().optional(),
  diagnosis: z.string().trim().optional(),
  drugNames: z.string().trim().optional(),
  age: z.number().int().min(0).max(130).optional(),
  gender: z.string().trim().optional(),
  department: z.string().trim().optional(),
  location: z.string().trim().optional(),
  admissionDate: z.string().optional(),
  dischargeDate: z.string().optional(),
  notes: z.string().trim().optional(),
  customValues: z.record(z.string(), z.any()).optional(),
  groupId: z.string().trim().min(1, 'Group ID is required'),
});

export const updateCaseDetailsSchema = z.object({
  patientName: z.string().trim().optional(),
  age: z.number().int().min(0).max(130).optional(),
  gender: z.string().trim().optional(),
  department: z.string().trim().optional(),
  location: z.string().trim().optional(),
  diagnosis: z.string().trim().optional(),
  drugNames: z.string().trim().optional(),
  admissionDate: z.string().optional(),
  dischargeDate: z.string().optional(),
  notes: z.string().trim().optional(),
  customValues: z.record(z.string(), z.any()).optional(),
  status: z.enum(['In Progress', 'Completed', 'Excluded']).optional(),
});
