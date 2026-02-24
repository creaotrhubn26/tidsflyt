import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tidsflyt API',
      version: '1.0.0',
      description: 'Time tracking and reporting API for Norwegian social work and consulting',
      contact: {
        name: 'Tidum Support',
        email: 'support@tidum.no',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://api.tidsflyt.no'
          : 'http://localhost:5000',
        description: process.env.NODE_ENV === 'production' ? 'Production' : 'Development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            code: {
              type: 'integer',
              description: 'HTTP status code',
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['user', 'vendor_admin', 'super_admin'] },
            vendorId: { type: 'integer', nullable: true },
          },
        },
        TimeEntry: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'string' },
            activity: { type: 'string' },
            title: { type: 'string' },
            project: { type: 'string' },
            place: { type: 'string' },
            notes: { type: 'string' },
            timeIn: { type: 'string', format: 'date-time' },
            timeOut: { type: 'string', format: 'date-time', nullable: true },
            paidBreak: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [
      { cookieAuth: [] },
      { bearerAuth: [] },
    ],
  },
  apis: ['./server/**/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Tidsflyt API Documentation',
  }));

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
