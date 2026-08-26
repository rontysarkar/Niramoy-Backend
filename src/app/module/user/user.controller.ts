import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { UserService } from "./user.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const profileImageUpdate = catchAsync(async (req: Request, res: Response) => {
	if (!req?.file) {
		throw new Error("File not found");
	}

	const result = await UserService.profileImageUpdate(
		req?.file?.buffer,
		req?.user?.userId as string,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Profile Updated Successfully",
		data: result,
	});
});

export const UserController = {
	profileImageUpdate,
};
