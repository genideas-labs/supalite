# SupaLite 예제

## 테스트 환경 설정

### PostgreSQL 설치 가이드
[메인 README의 PostgreSQL 설치 가이드 참조](../README.md#postgresql-설치)

### 테스트용 테이블 생성

1. PostgreSQL에 접속:
```sql
psql -U testuser -d testdb
```

2. 테스트용 테이블 생성:
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    bio TEXT,
    avatar_url VARCHAR(255)
);
```

3. 샘플 데이터 추가:
```sql
INSERT INTO users (name, email) VALUES
    ('홍길동', 'hong@example.com'),
    ('김철수', 'kim@example.com'),
    ('이영희', 'lee@example.com');

INSERT INTO profiles (user_id, bio) VALUES
    (1, '안녕하세요! 홍길동입니다.'),
    (2, '반갑습니다. 김철수입니다.'),
    (3, '이영희입니다. 잘 부탁드려요.');
```

## 환경 변수 설정

1. .env 파일 생성:
```bash
cat > .env << EOL
DB_USER=testuser
DB_HOST=localhost
DB_NAME=testdb
DB_PASS=testpassword
DB_PORT=5432
DB_SSL=false
EOL
```

## 예제 실행

```bash
# TypeScript로 직접 실행
npx ts-node examples/test.ts

# 또는 빌드 후 실행
npm run build
node examples/test.js
```

## 예제 파일 설명

### test.ts
기본적인 데이터베이스 연결 및 쿼리 테스트를 보여주는 예제입니다.
```typescript
import { supalitePg } from '../dist';

// 사용자 목록 조회
const result = await supalitePg
  .from('users')
  .select('*')
  .limit(5);

console.log('Users:', result.data);

// 특정 사용자의 프로필 조회
const userProfile = await supalitePg
  .from('profiles')
  .select('*')
  .eq('user_id', 1)
  .single();

console.log('Profile:', userProfile.data);
```

## 추가 예제 (준비 중)
- 트랜잭션 사용 예제
- UPSERT 작업 예제
- 복잡한 조인 쿼리 예제
- 실시간 구독 예제
