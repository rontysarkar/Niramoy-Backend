import { z } from 'zod';

export const userValidationSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  email: z.email("Invalid email address"),
});

export const doctorValidationSchema = z.object({
  address: z.string().nullable().optional(),
  specialization: z.string().min(1, "Specialization cannot be empty"),
  licenseNumber: z.string().min(1, "License number cannot be empty"),
  qualifications: z.string().min(1, "Qualifications cannot be empty"),
  experienceYears: z.string().min(1, "Experience years cannot be empty"),
  bio: z.string().nullable().optional(),
  consultationFee: z.union([z.number(), z.string()]).nullable().optional(),
  contactNumber: z.string().nullable().optional(),
});


export const applyAsDoctorVerifyEmailSchema = z.object({
  email:z.email("Invalid Email Address"),
  otp:z.string(),
})

export const approveDoctorPayloadSchema = z.object({
  doctorId:z.string(),
  verificationStatus:z.enum(["PENDING",'REJECTED',"APPROVED"]),
  rejectReason:z.string().optional(),
})

export const doctorWithUserSchema = z.object({
  user: userValidationSchema,
  doctor: doctorValidationSchema,
});


