import { env } from "../config/env.js";

/**
 * OpenAPI 3 spec for the public gateway API.
 * Mounted on /docs (Swagger UI) and /openapi.json.
 */
export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "WA Gateway API",
    version: "1.0.0",
    description:
      "REST API untuk mengirim pesan WhatsApp single & broadcast.\n\n" +
      "**Autentikasi**: kirim API key pada header `X-API-Key`.\n\n" +
      "Nomor telepon menerima format lokal (`0812...`), internasional (`+62812...`), " +
      "atau JID (`62812...@s.whatsapp.net`).",
  },
  servers: [{ url: `${env.publicBaseUrl}/api`, description: "Gateway API" }],
  tags: [
    { name: "Messaging", description: "Kirim pesan & broadcast" },
    { name: "Device", description: "Status koneksi WhatsApp" },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key dibuat dari dashboard (menu API Keys).",
      },
    },
    schemas: {
      SendMessageRequest: {
        type: "object",
        required: ["to"],
        properties: {
          to: { type: "string", example: "6281234567890", description: "Nomor tujuan" },
          body: { type: "string", example: "Halo, ini pesan dari API." },
          deviceId: {
            type: "string",
            description: "Opsional. Jika kosong, device terhubung pertama dipakai.",
          },
        },
      },
      SendBroadcastRequest: {
        type: "object",
        required: ["recipients", "template"],
        properties: {
          name: { type: "string", example: "Promo Ramadhan" },
          deviceId: { type: "string" },
          template: {
            type: "string",
            example: "Halo {{nama}}, ada promo spesial untuk nomor {{nomor}}!",
            description: "Gunakan {{nama}} dan {{nomor}} sebagai variabel dinamis.",
          },
          recipients: {
            description:
              "String multiline (`nomor,nama` per baris, header CSV otomatis dilewati) " +
              "atau array objek `{ phone, name }`.",
            oneOf: [
              { type: "string", example: "628111111111,Budi\n628222222222,Siti" },
              {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    phone: { type: "string" },
                    name: { type: "string" },
                  },
                },
              },
            ],
          },
          delayMs: {
            type: "integer",
            default: 4000,
            description: "Jeda antar pesan (ms). Minimum 1000.",
          },
          batchSize: {
            type: "integer",
            default: 20,
            description: "Jumlah pesan per batch sebelum jeda panjang.",
          },
          batchPauseMs: { type: "integer", default: 60000, description: "Jeda antar batch (ms)." },
          startNow: { type: "boolean", default: true, description: "Jalankan langsung" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object", nullable: true },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    "/send-message": {
      post: {
        tags: ["Messaging"],
        summary: "Kirim pesan ke satu nomor",
        description: "Content-Type `application/json` atau `multipart/form-data` untuk lampiran.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SendMessageRequest" } },
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["to"],
                properties: {
                  to: { type: "string" },
                  body: { type: "string" },
                  deviceId: { type: "string" },
                  media: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Pesan terkirim",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        to: { type: "string" },
                        status: { type: "string", enum: ["sent", "failed"] },
                        providerId: { type: "string", nullable: true },
                        sentAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Request tidak valid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "API key tidak valid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Device belum terhubung", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "Rate limit / kuota habis", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/send-broadcast": {
      post: {
        tags: ["Messaging"],
        summary: "Kirim pesan massal (async)",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SendBroadcastRequest" } },
          },
        },
        responses: {
          202: {
            description: "Broadcast diterima dan masuk queue",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        broadcastId: { type: "string" },
                        status: { type: "string" },
                        total: { type: "integer" },
                        accepted: { type: "integer" },
                        rejected: { type: "array", items: { type: "object" } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Request tidak valid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "API key tidak valid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/device/status": {
      get: {
        tags: ["Device"],
        summary: "Cek status koneksi device",
        parameters: [
          { in: "query", name: "deviceId", schema: { type: "string" }, required: false },
        ],
        responses: {
          200: {
            description: "Status device",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          status: { type: "string", enum: ["connected", "connecting", "disconnected", "logged_out"] },
                          connected: { type: "boolean" },
                          phoneNumber: { type: "string", nullable: true },
                          lastSeenAt: { type: "string", format: "date-time", nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "API key tidak valid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/broadcast/{id}": {
      get: {
        tags: ["Messaging"],
        summary: "Status & progress broadcast",
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Detail broadcast" },
          404: { description: "Tidak ditemukan", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/messages": {
      get: {
        tags: ["Messaging"],
        summary: "Riwayat pesan",
        parameters: [
          { in: "query", name: "page", schema: { type: "integer", default: 1 } },
          { in: "query", name: "limit", schema: { type: "integer", default: 20 } },
          {
            in: "query",
            name: "status",
            schema: { type: "string", enum: ["queued", "sending", "sent", "failed"] },
          },
          { in: "query", name: "deviceId", schema: { type: "string" } },
        ],
        responses: { 200: { description: "Daftar pesan" } },
      },
    },
  },
};
