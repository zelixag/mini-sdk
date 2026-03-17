export default SaveAndDownload;
declare class SaveAndDownload {
    constructor(fileName?: string, enabled?: boolean);
    fileName: string;
    enabled: boolean;
    data: {};
    downloadButton: HTMLAnchorElement | null;
    initDownloadButton(): void;
    writeFields(fields: any): void;
    appendMultipleToArray(fieldName: any, items: any): void;
    download(): void;
    generateJSContent(): string;
    downloadFile(content: any, fileName: any, contentType: any): void;
}
