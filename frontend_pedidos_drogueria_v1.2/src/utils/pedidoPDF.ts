import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoEmpresaUrl from '../assets/drogueria_logo.png';

export interface LineaPDF {
    codigo: string | number;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    precioBase?: number;
    descuentos?: number[];
    esControlado?: boolean;
}

export interface PedidoPDFData {
    numeroOrden: string;
    fecha?: string;
    estatus?: string;
    cliente: {
        codcliente?: string | number;
        nombrecliente: string;
        nit?: string;
        direccionFiscal?: string;
        direccionEnvio?: string;
    };
    lineas: LineaPDF[];
    totalUSD: number;
}

export async function generarPedidoPDF(data: PedidoPDFData): Promise<void> {
    const doc = new jsPDF();

    // --- Logo ---
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = logoEmpresaUrl;
        });
        doc.addImage(img, 'PNG', 14, 5, 42, 22);
    } catch { /* si falla, el PDF sigue sin logo */ }

    // --- Encabezado empresa ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('DROGUERIA INTERCONTINENTAL, C.A.', 62, 13);
    doc.setFontSize(9);
    doc.text('RIF: J501590192', 162, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('AV. CRUZ PERAZA LOCAL GALPON NRO 02 SECTOR LA\nCARBONERA MATURIN MONAGAS ZONA POSTAL 6201', 62, 18);
    doc.line(14, 30, 196, 30);

    // --- Cabecera del pedido ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PEDIDO DE CLIENTE', 14, 38);
    doc.text(`N°: ${data.numeroOrden}`, 150, 38);

    // --- Datos del cliente ---
    doc.setFillColor(248, 248, 248);
    doc.rect(14, 41, 182, data.estatus ? 36 : 30, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');

    const tz = { timeZone: 'America/Caracas' };
    const fechaTexto = data.fecha
        ? new Date(data.fecha).toLocaleString('es-VE', tz)
        : new Date().toLocaleDateString('es-VE', tz);
    doc.text(`Fecha: ${fechaTexto}`, 155, 46);
    doc.text(`ID Cliente: ${data.cliente.codcliente ?? '---'}`, 16, 46);

    doc.text('Razón Social:', 16, 52);
    doc.setFont('helvetica', 'bold');
    doc.text(data.cliente.nombrecliente || 'N/A', 40, 52);
    doc.setFont('helvetica', 'normal');

    doc.text(`RIF/CI: ${data.cliente.nit || 'N/A'}`, 155, 52);
    doc.text(`Dir. Fiscal:  ${data.cliente.direccionFiscal || 'N/A'}`, 16, 58);
    doc.text(`Dir. Envío:   ${data.cliente.direccionEnvio  || 'N/A'}`, 16, 63);

    let datosFin = 73;
    if (data.estatus) {
        doc.setFont('helvetica', 'bold');
        doc.text(`Estado: ${data.estatus}`, 16, 69);
        doc.setFont('helvetica', 'normal');
        datosFin = 78;
    }

    doc.setFont('helvetica', 'bold');
    doc.text('Tipo:', 16, datosFin - 1);
    doc.setFont('helvetica', 'normal');
    doc.text('Monto Factura — Indexa a partir de 30 días', 30, datosFin - 1);

    // --- Tabla de líneas ---
    const filas = data.lineas.map(l => {
        const descPct = l.descuentos?.length
            ? `${l.descuentos.join('%+')}%`
            : '';
        return [
            l.codigo,
            (l.descripcion || '') + (l.esControlado ? ' (CONTROLADO)' : ''),
            l.cantidad,
            '',   // Seg.
            '',   // ESC PRD
            '',   // ESC PRD
            '',   // ESC PRV
            descPct,
            l.precioUnitario.toFixed(2),
            (l.precioUnitario * l.cantidad).toFixed(2),
        ];
    });

    autoTable(doc, {
        startY: datosFin + 5,
        head: [['Código', 'Descripción', 'Cant.', 'Seg.', 'ESC PRD', 'ESC PRD', 'ESC PRV', 'DESC.', 'Precio', 'Importe']],
        body: filas,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: 52 },
            8: { halign: 'right' },
            9: { halign: 'right' },
        },
    });

    // --- Totales ---
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'normal');
    doc.rect(50, finalY, 146, 6);
    doc.text('Monto Total de la Base Imponible según Alícuota: USD:', 86, finalY + 4.5);
    doc.text(data.totalUSD.toFixed(2), 192, finalY + 4.5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.rect(50, finalY + 12, 146, 8);
    doc.text('VALOR TOTAL:    USD:', 132, finalY + 17.5);
    doc.text(data.totalUSD.toFixed(2), 192, finalY + 17.5, { align: 'right' });

    // Copyright footer
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text('© RedesIP — Sistema de Pedidos Droguería Intercontinental', 105, pageH - 5, { align: 'center' });
    doc.setTextColor(0);

    doc.save(`Pedido_${data.numeroOrden}.pdf`);
}
