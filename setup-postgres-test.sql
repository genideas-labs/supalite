-- 테스트 사용자 생성 (이미 존재하면 삭제 후 재생성)
DROP USER IF EXISTS testuser;
CREATE USER testuser WITH PASSWORD 'testpassword';

-- 테스트 데이터베이스 생성 (이미 존재하면 삭제 후 재생성)
DROP DATABASE IF EXISTS testdb;
CREATE DATABASE testdb;

-- 테스트 사용자에게 테스트 데이터베이스에 대한 모든 권한 부여
GRANT ALL PRIVILEGES ON DATABASE testdb TO testuser;

-- 테스트 데이터베이스에 접속
\c testdb

-- 테스트 사용자를 테스트 데이터베이스의 소유자로 설정
ALTER DATABASE testdb OWNER TO testuser;

-- 테스트 사용자에게 스키마 생성 권한 부여
GRANT CREATE ON SCHEMA public TO testuser;
