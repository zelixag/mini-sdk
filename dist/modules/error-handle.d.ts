import { EErrorCode } from "types/error";
export default function Errors(params: {
    code: EErrorCode;
    message: string;
    e?: any;
}): {
    code: EErrorCode;
    message: string;
    timestamp: number;
    originalError: string | null;
};
