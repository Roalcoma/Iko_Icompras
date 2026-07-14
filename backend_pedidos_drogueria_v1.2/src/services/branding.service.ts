import fs from 'fs';
import path from 'path';

const BRANDING_PATH = path.join(process.cwd(), 'config', 'branding.json');

export interface Branding {
    primary: string;
    secondary: string;
    logoBase64: string | null;
}

const DEFAULTS: Branding = {
    primary:    '#0891B2',
    secondary:  '#059669',
    logoBase64: null,
};

export class BrandingService {
    static get(): Branding {
        try {
            if (fs.existsSync(BRANDING_PATH))
                return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(BRANDING_PATH, 'utf-8')) };
        } catch { /* use defaults */ }
        return { ...DEFAULTS };
    }

    static set(data: Partial<Branding>): void {
        const updated = { ...BrandingService.get(), ...data };
        fs.mkdirSync(path.dirname(BRANDING_PATH), { recursive: true });
        fs.writeFileSync(BRANDING_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    }
}
