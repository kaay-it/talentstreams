CREATE TABLE "streams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "streams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "streams" ("name", "type", "description") VALUES
  ('Startup',                  'Industry',    'Стартапы, scale-up компании, венчурные проекты'),
  ('Fintech & Banking',        'Industry',    'Банки, финтех, платёжные сервисы, необанки, BNPL'),
  ('E-commerce & Retail',      'Industry',    'Маркетплейсы, e-commerce, retail-tech, delivery'),
  ('AI',                       'Industry',    'AI-компании, LLM-проекты, AI-first продукты'),
  ('IT/SaaS/Software & Data',  'Industry',    'Продуктовые IT-компании, SaaS, data-команды'),
  ('Telecom & Enterprise',     'Industry',    'Телеком, enterprise-tech, цифровая трансформация'),
  ('Product',                  'Functional',  'Product и Project менеджеры, уровень Lead и выше'),
  ('Tech',                     'Functional',  'Технические руководители, уровень Lead и выше'),
  ('Back Office',              'Functional',  'HR, финансы, юридическая функция, compliance, уровень Lead и выше'),
  ('Commercial',               'Functional',  'Sales, BD, customer success, revenue management, уровень Lead и выше'),
  ('Executive',                'Functional',  'Директора и VP всех функций и отраслей')
;
