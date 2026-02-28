declare module "qz-tray" {
	type QzCertificateResolver = (certificate?: string) => void;
	type QzSignatureResolver = (signature?: string) => void;
	type QzCertificatePromiseFactory = (resolve: QzCertificateResolver) => void;
	type QzSignaturePromiseFactory = (toSign: string) => (resolve: QzSignatureResolver) => void;

	interface QzPrinterConfig {
		size?: {
			width?: number | null;
			height?: number | null;
		};
		units?: string;
		orientation?: string;
		margins?: {
			top?: number;
			right?: number;
			bottom?: number;
			left?: number;
		};
		colorType?: string;
		interpolation?: string;
	}

	interface QzPrintData {
		type: string;
		format?: string;
		flavor?: string;
		data: string;
	}

	interface QzConfigHandle {
		readonly printer: string;
	}

	interface QzTrayApi {
		security: {
			setCertificatePromise(factory: QzCertificatePromiseFactory): void;
			setSignatureAlgorithm(algorithm: string): void;
			setSignaturePromise(factory: QzSignaturePromiseFactory): void;
		};
		websocket: {
			isActive(): boolean;
			connect(): Promise<void>;
			disconnect(): Promise<void>;
			setClosedCallbacks(callback: () => void): void;
		};
		printers: {
			find(): Promise<string | string[] | undefined>;
		};
		configs: {
			create(printer: string, config?: QzPrinterConfig): QzConfigHandle;
		};
		print(config: QzConfigHandle, data: QzPrintData[]): Promise<void>;
	}

	const qz: QzTrayApi;
	export default qz;
}
