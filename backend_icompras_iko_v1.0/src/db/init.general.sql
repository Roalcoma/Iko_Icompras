-- Script de inicializacion para base de datos general_drogueria
-- Ejecutar una sola vez en SQL Server

USE general_drogueria;
GO

-- Tabla de usuarios del sistema
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PED_USUARIOS' AND xtype='U')
CREATE TABLE PED_USUARIOS (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    USERNAME    NVARCHAR(50)  NOT NULL UNIQUE,
    PASSWORD_HASH NVARCHAR(255) NOT NULL,
    NOMBRE      NVARCHAR(100),
    EMAIL       NVARCHAR(100),
    ACTIVO      BIT DEFAULT 1,
    FECHA_CREACION DATETIME DEFAULT GETDATE()
);
GO

-- Tabla de modulos del sistema
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PED_MODULOS' AND xtype='U')
CREATE TABLE PED_MODULOS (
    ID      INT IDENTITY(1,1) PRIMARY KEY,
    NOMBRE  NVARCHAR(100) NOT NULL,
    RUTA    NVARCHAR(100),
    ICONO   NVARCHAR(100),
    ORDEN   INT DEFAULT 0,
    ACTIVO  BIT DEFAULT 1
);
GO

-- Tabla de permisos por usuario y modulo
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PED_PERMISOS_USUARIO' AND xtype='U')
CREATE TABLE PED_PERMISOS_USUARIO (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    USUARIO_ID  INT NOT NULL REFERENCES PED_USUARIOS(ID),
    MODULO_ID   INT NOT NULL REFERENCES PED_MODULOS(ID),
    PUEDE_VER   BIT DEFAULT 0,
    PUEDE_CREAR BIT DEFAULT 0,
    PUEDE_EDITAR BIT DEFAULT 0,
    PUEDE_ELIMINAR BIT DEFAULT 0,
    CONSTRAINT UQ_USUARIO_MODULO UNIQUE(USUARIO_ID, MODULO_ID)
);
GO

-- Insertar modulos del sistema (si no existen)
IF NOT EXISTS (SELECT 1 FROM PED_MODULOS)
BEGIN
    INSERT INTO PED_MODULOS (NOMBRE, RUTA, ICONO, ORDEN) VALUES
    ('Catálogo',        '/',                 'mdi-store-search', 1),
    ('Carrito',         '/carrito',          'mdi-cart',         2),
    ('Control Estatus', '/pedidos-estatus',  'mdi-list-status',  3),
    ('Edición Pedidos', '/pedidos-edicion',  'mdi-file-edit',    4);
END
GO

-- Usuario administrador por defecto (password: admin123)
-- Hash bcrypt de 'admin123'
IF NOT EXISTS (SELECT 1 FROM PED_USUARIOS WHERE USERNAME = 'admin')
BEGIN
    INSERT INTO PED_USUARIOS (USERNAME, PASSWORD_HASH, NOMBRE, EMAIL)
    VALUES ('admin', '$2b$10$YourHashHere', 'Administrador', 'admin@drogueria.com');
END
GO
