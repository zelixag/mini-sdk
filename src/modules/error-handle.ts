import { EErrorCode } from "types/error";

export default function Errors(params: {
  code: EErrorCode
  message: string
  e?: any
}) {
  return {
    code: params.code,
    message: params.message,
    timestamp: Date.now(),
    originalError: params.e ? JSON.stringify(params.e) : null,
  }
}
