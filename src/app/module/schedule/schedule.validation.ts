import z from "zod";


export const CreateSchedulePayloadSchema = z.object({
    startDateTime:z.date(),
    endDateTime : z.date(),
    meetingLink:z.string(),
})