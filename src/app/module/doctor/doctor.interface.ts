import { DoctorVerificationStatus } from "../../../generated/prisma/enums";

export interface IUser {
  name: string;
  email: string;
}

export interface IDoctor {
  address?: string | null;
  specialization: string;
  licenseNumber: string;
  qualifications: string;
  experienceYears: string;
  bio?: string | null;
  consultationFee?: number | string | null;
  contactNumber?: string | null;
}

export interface IDoctorWithUser {
  user: IUser;
  doctor: IDoctor;
}


export interface IApproveDoctorPayload {
  doctorId:string,
  verificationStatus:DoctorVerificationStatus,
  rejectReason?:string,
}


export interface IUpdateDoctorProfilePayload {
    address?: string;
    bio?: string;
    consultationFee?: number;
    contactNumber?: string;
}