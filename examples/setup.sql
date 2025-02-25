-- 테이블 생성
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

-- 샘플 데이터 추가
INSERT INTO users (name, email) VALUES
    ('홍길동', 'hong@example.com'),
    ('김철수', 'kim@example.com'),
    ('이영희', 'lee@example.com');

INSERT INTO profiles (user_id, bio) VALUES
    (1, '안녕하세요! 홍길동입니다.'),
    (2, '반갑습니다. 김철수입니다.'),
    (3, '이영희입니다. 잘 부탁드려요.');
