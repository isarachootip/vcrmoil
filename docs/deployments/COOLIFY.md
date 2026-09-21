# คู่มือการ Deploy vCRM ขึ้น Coolify (Self-Hosted PaaS)

คู่มือนี้แนะนำขั้นตอนการนำ **vCRM** ขึ้นสู่ระบบ [Coolify](https://coolify.io) อย่างละเอียด รองรับทั้งการ Deploy แบบ **Docker Compose (Full Stack)** และแบบ **Standalone Application (Dockerfile)**

---

## สรุปแนวทางการ Deploy บน Coolify

| วิธี                                                | เหมาะสำหรับ                                                              | สิ่งที่ Coolify จัดการ                                                |
| :-------------------------------------------------- | :----------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **วิธีที่ 1: Docker Compose Stack** _(แนะนำที่สุด)_ | ต้องการ Deploy ทั้ง API + Database + Redis พร้อมกันในที่เดียว            | สร้าง container API, PostgreSQL 16 (พร้อม RLS) และ Redis 7 ให้ครบวงจร |
| **วิธีที่ 2: Standalone Application**               | มี PostgreSQL และ Redis ภายนอกอยู่แล้ว (เช่น Neon, AWS RDS, ElastiCache) | Build เฉพาะตัว vCRM API Image ผ่าน Dockerfile                         |

---

## วิธีที่ 1: Deploy ผ่าน Docker Compose Stack (All-in-One)

วิธีนี้จะนำไฟล์ [docker-compose.coolify.yml](../../docker-compose.coolify.yml) ไปรันบน Coolify โดยอัตโนมัติ

### ขั้นตอนที่ 1: เพิ่ม Resource ใน Coolify

1. เข้าสู่แดชบอร์ดของ Coolify → ไปที่ Project และ Environment ที่ต้องการ
2. กดปุ่ม **+ New Resource**
3. เลือก **Docker Compose**
4. เลือก **Public Repository** หรือ **GitHub / GitLab App** ที่เชื่อมต่อกับ repo `vcrm`
5. ระบุ Branch (เช่น `master` หรือ `main`)
6. ในช่อง **Docker Compose Location** ระบุ:
   ```text
   docker-compose.coolify.yml
   ```

### ขั้นตอนที่ 2: ตั้งค่า Environment Variables ใน Coolify

ไปที่แท็บ **Environment Variables** ในหน้า Resource แล้วกำหนดค่า (ดูตัวอย่างจาก [.env.coolify.example](../../.env.coolify.example)):

```env
NODE_ENV=production
LOG_LEVEL=info
BASE_DOMAIN=vcrm.yourdomain.com
API_URL=https://api.vcrm.yourdomain.com
WEB_URL=https://app.vcrm.yourdomain.com

POSTGRES_PASSWORD=สร้างรหัสผ่าน_postgres_ที่ปลอดภัย
POSTGRES_APP_PASSWORD=สร้างรหัสผ่าน_app_user_ที่ปลอดภัย
POSTGRES_OWNER_PASSWORD=สร้างรหัสผ่าน_owner_user_ที่ปลอดภัย

JWT_LOCAL_SECRET=สร้างรหัสลับ_jwt_ความยาวไม่ต่ำกว่า_32_ตัวอักษร
AUTH_MODE=local
```

### ขั้นตอนที่ 3: กำหนด Domain และ SSL

1. ในหน้า Service Settings ของ `api`
2. ใส่ Domain เช่น `https://api.vcrm.yourdomain.com`
3. Coolify (Traefik) จะออกใบรับรอง SSL (Let's Encrypt) ให้อัตโนมัติ

### ขั้นตอนที่ 4: กด Deploy

1. กดปุ่ม **Deploy**
2. Coolify จะ clone repository, build Docker image แบบ multi-stage, รอให้ database พร้อม, รัน `prisma migrate deploy` อัตโนมัติผ่าน `docker-entrypoint.sh`
3. เมื่อสถานะเปลี่ยนเป็น **Healthy** แสดงว่าระบบพร้อมให้บริการ

---

## วิธีที่ 2: Deploy เฉพาะตัว API (Standalone Application)

### ขั้นตอนที่ 1: เพิ่ม Application ใน Coolify

1. กด **+ New Resource** → เลือก **Application**
2. เลือก Git Repository ของ `vcrm`
3. ตั้งค่า Build Configuration:
   - **Build Pack**: `Dockerfile`
   - **Base Directory**: `/` _(สำคัญมาก ต้องเป็น root เพื่อให้ pnpm workspace build ได้)_
   - **Dockerfile Location**: `/Dockerfile`
   - **Ports Exposes**: `4000`

### ขั้นตอนที่ 2: กำหนด Healthcheck

- **Healthcheck Path**: `/health`
- **Interval**: `15s`
- **Timeout**: `5s`
- **Retries**: `5`

### ขั้นตอนที่ 3: ระบุ Environment Variables

เชื่อมต่อกับ Database และ Redis ภายนอก:

```env
NODE_ENV=production
API_PORT=4000
DATABASE_URL=postgresql://vcrm_app:password@your-db-host:5432/vcrm
DATABASE_MIGRATION_URL=postgresql://vcrm_owner:password@your-db-host:5432/vcrm
REDIS_URL=redis://your-redis-host:6379
JWT_LOCAL_SECRET=your-random-production-secret
AUTH_MODE=local
BASE_DOMAIN=vcrm.yourdomain.com
```

### ขั้นตอนที่ 4: กด Deploy

กดปุ่ม **Deploy** เพื่อเริ่มต้น build และ deploy ทันที

---

## การตรวจสอบสถานะการทำงาน (Verification)

หลังจาก Deploy สำเร็จ สามารถทดสอบได้โดย:

1. **Health Check Endpoint**:

   ```bash
   curl -i https://api.vcrm.yourdomain.com/health
   # ผลลัพธ์: HTTP 200 OK {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}}
   ```

2. **OpenAPI / Swagger Documentation**:
   เปิดเบราว์เซอร์ไปที่:

   ```text
   https://api.vcrm.yourdomain.com/api/docs
   ```

3. **ทดสอบ Login API**:
   ```bash
   curl -X POST https://api.vcrm.yourdomain.com/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@yourdomain.com", "password": "yourpassword", "tenantSlug": "yourtenant"}'
   ```
