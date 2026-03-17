export const ttsData: ({
    client_frame_number: string;
    event_type: string;
    event_data: {
        version: string;
        server_time: number;
        start_frame?: undefined;
        state?: undefined;
        params?: undefined;
        msg?: undefined;
        type?: undefined;
        session_id?: undefined;
    };
    is_binary: boolean;
} | {
    client_frame_number: string;
    event_type: string;
    event_data: {
        start_frame: number;
        state: string;
        params: {};
        version?: undefined;
        server_time?: undefined;
        msg?: undefined;
        type?: undefined;
        session_id?: undefined;
    };
    is_binary: boolean;
} | {
    client_frame_number: string;
    event_type: string;
    event_data: string;
    is_binary: boolean;
} | {
    client_frame_number: string;
    event_type: string;
    event_data: {
        msg: string;
        type: string;
        version?: undefined;
        server_time?: undefined;
        start_frame?: undefined;
        state?: undefined;
        params?: undefined;
        session_id?: undefined;
    };
    is_binary: boolean;
} | {
    client_frame_number: string;
    event_type: string;
    event_data: {
        session_id: string;
        version?: undefined;
        server_time?: undefined;
        start_frame?: undefined;
        state?: undefined;
        params?: undefined;
        msg?: undefined;
        type?: undefined;
    };
    is_binary: boolean;
})[];
