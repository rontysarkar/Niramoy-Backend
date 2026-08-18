import z, { email, string } from "zod";

const RegistrationPatientSchema = z.object({
  name: z.string(),
  email: z.email(),
  password: z
    .string()
    .min(8, { message: " must be at least 8 characters long" })
    .max(100, { message: " cannot exceed 100 characters" })
    .regex(/[A-Z]/, {
      message: " must contain at least one uppercase letter",
    })
    .regex(/[a-z]/, {
      message: " must contain at least one lowercase letter",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[^A-Za-z0-9]/, {
      message: " must contain at least one special character",
    }),
});

const VerifyEmailSchema = z.object({
  email:z.email(),
  otp:z.string()
})

const LoginUserSchema = z.object({
  email: z.email(),
  password: z.string(),
});

const ForgotPasswordSchema = z.object({
  email:z.email(),
})

const ResetPasswordSchema = z.object({
  otp:z.string(),
  email:z.email(),
  newPassword:z
    .string()
    .min(8, { message: " must be at least 8 characters long" })
    .max(100, { message: " cannot exceed 100 characters" })
    .regex(/[A-Z]/, {
      message: " must contain at least one uppercase letter",
    })
    .regex(/[a-z]/, {
      message: " must contain at least one lowercase letter",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[^A-Za-z0-9]/, {
      message: " must contain at least one special character",
    }),
})



export const UserValidation = {
  RegistrationPatientSchema,
  LoginUserSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
};
