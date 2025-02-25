-- 기존 테이블 삭제
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 테이블 생성
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    avatar_url VARCHAR(255),
    interests TEXT[],
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    tags TEXT[],
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 샘플 데이터 추가
INSERT INTO users (name, email, status, last_login, created_at) VALUES
    ('홍길동', 'hong@example.com', 'active', NOW() - INTERVAL '1 day', NOW()),
    ('김철수', 'kim@example.com', 'active', NOW() - INTERVAL '2 days', NOW()),
    ('이영희', 'lee@example.com', 'inactive', NOW() - INTERVAL '10 days', NOW()),
    ('박지민', 'park@example.com', 'active', NOW(), NOW()),
    ('최유진', 'choi@example.com', 'active', NOW() - INTERVAL '5 days', NOW());

INSERT INTO profiles (user_id, bio, interests, updated_at) VALUES
    (1, '안녕하세요! 홍길동입니다.', ARRAY['독서', '여행', '프로그래밍'], NOW()),
    (2, '반갑습니다. 김철수입니다.', ARRAY['게임', '음악', '영화'], NOW()),
    (3, '이영희입니다. 잘 부탁드려요.', ARRAY['요리', '운동'], NOW()),
    (4, '박지민입니다!', ARRAY['사진', '여행', '음악'], NOW()),
    (5, '최유진이에요~', ARRAY['그림', '댄스'], NOW());

INSERT INTO posts (user_id, title, content, tags, views, created_at, updated_at) VALUES
    (1, '첫 번째 포스트', '안녕하세요, 첫 게시물입니다.', ARRAY['인사', '소개'], 100, NOW(), NOW()),
    (1, '여행 후기', '지난 주말 여행 다녀왔어요.', ARRAY['여행', '후기'], 50, NOW(), NOW()),
    (2, '프로그래밍 팁', '코딩할 때 유용한 팁 공유합니다.', ARRAY['프로그래밍', '팁'], 200, NOW(), NOW()),
    (3, '맛집 추천', '우리 동네 맛집 추천합니다.', ARRAY['맛집', '추천'], 150, NOW(), NOW()),
    (4, '취미 생활', '새로운 취미를 시작했어요.', ARRAY['취미', '일상'], 80, NOW(), NOW());

INSERT INTO comments (post_id, user_id, content, created_at) VALUES
    (1, 2, '환영합니다!', NOW()),
    (1, 3, '반갑습니다~', NOW()),
    (2, 4, '좋은 정보 감사합니다.', NOW()),
    (3, 5, '유용한 정보네요!', NOW()),
    (4, 1, '저도 한번 가보고 싶네요.', NOW());
