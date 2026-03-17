export interface Headers {
    [key: string]: string;
}
export declare function headersNeedSign(ak: string, sk: string, method: string, url: string, data: Record<string, any>): {
    headers: Headers;
    data: Record<string, any>;
};
