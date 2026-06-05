import { ref } from "vue";
import { calculateBarcodeDimensions, type PrintContext, type PrinterDPI, type OutputContext } from "./useBarcodePrintOutput";

export interface ZplConfig {
  labelWidthMm: number;
  labelHeightMm: number;
  printDensity: number;
}

export interface RfidConfig {
  enabled: boolean;
  tagType?: string;
  epcPrefix?: string;
  encodingPower?: number;
}

export function useZplGenerator() {
  const zplConfig = ref<ZplConfig>({
    labelWidthMm: 50,
    labelHeightMm: 25,
    printDensity: 203,
  });

  const mmToDots = (mm: number, dpi?: number): number => {
    const actualDpi = dpi ?? zplConfig.value.printDensity;
    return Math.round((mm * actualDpi) / 25.4);
  };

  const escapeZpl = (value: string): string => {
    return (value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\^/g, "")
      .replace(/\~/g, "")
      .replace(/\,/g, " ")
      .replace(/\n/g, " ")
      .replace(/\r/g, "");
  };

  const getZplBarcodeCommand = (symbology: string, barHeightDots: number): string => {
    const h = barHeightDots;
    switch (symbology) {
      case "EAN13":
      case "EAN8":
        return `^BEN,${h},Y,N`;
      case "UPC":
        return `^BUN,${h},Y,N,Y`;
      case "ITF14":
        return `^B2N,${h},Y,N,Y`;
      case "ITF":
        return `^B2N,${h},Y,N,N`;
      case "CODABAR":
        return `^BKN,${h},Y,N,N`;
      case "CODE39":
        return `^B3N,${h},Y,N,N`;
      case "GS1_128":
      case "CODE128":
      default:
        return `^BCN,${h},Y,N,N,A`;
    }
  };

  const buildRfidHeader = (epcHex: string, rfid?: RfidConfig): string => {
    if (!rfid?.enabled) return "";
    const tagTypeMap: Record<string, string> = {
      "Generic": "0",
      "AD-222": "1",
      "AD-220": "2",
      "AD-236": "3",
      "AD-431": "4",
      "AD-432": "5",
      "AD-612": "6",
      "AD-620": "7",
      "AD-621": "8",
      "AD-640": "9",
    };
    const tagType = tagTypeMap[rfid.tagType || "Generic"] || "0";
    const power = rfid.encodingPower != null && rfid.encodingPower > 0 ? String(rfid.encodingPower) : "";
    const epcValue = epcHex || "";
    let cmd = `^RS${power ? "," + tagType + "," + power : "," + tagType}^FS\n`;
    if (epcValue) {
      cmd += `^RFE,${epcValue}^FS\n`;
    }
    return cmd;
  };

  const toEpcHex = (value: string): string => {
    let hex = "";
    for (let i = 0; i < value.length; i++) {
      hex += value.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex.toUpperCase();
  };

  const getEplBarcodeType = (symbology: string): string => {
    switch (symbology) {
      case "EAN13":
        return "E";
      case "EAN8":
        return "E8";
      case "UPC":
        return "U";
      case "ITF14":
      case "ITF":
        return "2";
      case "CODABAR":
        return "K";
      case "CODE39":
        return "1";
      case "GS1_128":
      case "CODE128":
      default:
        return "0";
    }
  };

  const generateZpl = (item: {
    item_name: string;
    barcode: string;
    price?: number;
    uom?: string;
    currency?: string;
    symbologyName?: string;
    printContext?: PrintContext;
    _epc_data?: string;
    _rfid_config?: RfidConfig;
  }): string => {
    const name = escapeZpl(item.item_name || "");
    const barcode = escapeZpl(item.barcode || "");
    const ctx = item.printContext ?? { dpi: 203 as PrinterDPI, output: 'qz_raw_zpl' as OutputContext, labelWidthMm: 50, labelHeightMm: 25 };
    const width = mmToDots(ctx.labelWidthMm, ctx.dpi);
    const height = mmToDots(ctx.labelHeightMm, ctx.dpi);
    const sym = item.symbologyName || "CODE128";
    const dims = calculateBarcodeDimensions(sym, ctx, item.barcode?.length);
    const moduleWidthDots = Math.max(1, dims.moduleWidthPx);
    const barHeightDots = dims.heightPx;
    const price = item.price != null ? `${item.currency || ""} ${Number(item.price).toFixed(2)}` : "";
    const uom = escapeZpl(item.uom || "");
    const bcCmd = getZplBarcodeCommand(sym, barHeightDots);
    const rfidHeader = buildRfidHeader(item._epc_data || "", item._rfid_config);

    let zpl = `^XA
`;
    if (rfidHeader) {
      zpl += rfidHeader;
    }
    zpl += `^CF0,20
^FO10,10^FB${width - 20},20,0,C,0^FD${name}^FS
`;
    if (uom) {
      zpl += `^CF0,15
^FO10,${height - 80}^FB${width - 20},15,0,C,0^FD${uom}^FS
`;
    }
    zpl += `^FO10,${height - 60}^BY${moduleWidthDots},3,${barHeightDots}${bcCmd}^FD${barcode}^FS
`;
    if (price) {
      zpl += `^CF0,18
^FO10,${height - 30}^FB${width - 20},18,0,C,0^FD${price}^FS
`;
    }
    zpl += `^XZ`;
    return zpl;
  };

  const generateEpl = (item: {
    item_name: string;
    barcode: string;
    price?: number;
    uom?: string;
    currency?: string;
    symbologyName?: string;
    printContext?: PrintContext;
  }): string => {
    const name = escapeZpl(item.item_name || "");
    const barcodeValue = escapeZpl(item.barcode || "");
    const ctx = item.printContext ?? { dpi: 203 as PrinterDPI, output: 'qz_raw_epl' as OutputContext, labelWidthMm: 50, labelHeightMm: 25 };
    const price = item.price != null ? `${item.currency || ""} ${Number(item.price).toFixed(2)}` : "";
    const uom = escapeZpl(item.uom || "");
    const sym = item.symbologyName || "CODE128";
    const dims = calculateBarcodeDimensions(sym, ctx, item.barcode?.length);
    const moduleWidthDots = Math.max(1, dims.moduleWidthPx);
    const barHeightDots = dims.heightPx;
    const eplType = getEplBarcodeType(sym);
    const widthDots = mmToDots(ctx.labelWidthMm, ctx.dpi);
    const heightDots = mmToDots(ctx.labelHeightMm, ctx.dpi);

    let epl = "";
    const nameLine = name.length > 30 ? name.substring(0, 30) : name;
    epl += `N\n`;
    epl += `q${widthDots}\n`;
    epl += `Q${heightDots},0\n`;
    epl += `R0,0\n`;
    const yCenter = Math.round(heightDots / 2);
    const xMargin = Math.round(widthDots * 0.2);
    epl += `A${xMargin},${yCenter - 30},0,1,1,1,N,"${nameLine}"\n`;
    if (uom) {
      epl += `A${xMargin},${yCenter - 10},0,1,1,1,N,"${uom}"\n`;
    }
    epl += `B${xMargin},${yCenter + 5},0,${eplType},${moduleWidthDots},0,${barHeightDots},N,"${barcodeValue}"\n`;
    if (price) {
      epl += `A${xMargin},${yCenter + 60},0,1,1,1,N,"${price}"\n`;
    }
    epl += `P1\n`;
    return epl;
  };

  return {
    zplConfig,
    generateZpl,
    generateEpl,
    buildRfidHeader,
    toEpcHex,
  };
}
