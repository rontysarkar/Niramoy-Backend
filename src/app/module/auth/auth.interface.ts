import type { Role } from "../../../generated/prisma/browser";

export interface ILoginUserPayload {
	email: string;
	password: string;
}

export interface IRegisterPatientPayload {
	name: string;
	email: string;
	password: string;
}

export interface IVerifyEmailPayload {
	email: string;
	otp: string;
}

export interface IRequestUser {
	userId: string;
	email: string;
	name: string;
	role: Role;
}

export interface IForgotPasswordPayload {
	email: string;
}

export interface IResetPasswordPayload {
	otp: string;
	email: string;
	newPassword: string;
}

export interface googleLoginPayload {
	idToken: string;
}
