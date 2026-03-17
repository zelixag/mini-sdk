export default SaveAndDownload;
declare class SaveAndDownload {
    data: string;
    first: boolean;
    button: HTMLAnchorElement;
    push(data: any): void;
    save(): void;
    downloadFile(content: any, fileName: any, contentType: any): void;
}
