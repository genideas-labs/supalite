-- 기존 테이블 삭제 (있는 경우)
DROP VIEW IF EXISTS user_posts_view;
DROP VIEW IF EXISTS active_users_view;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS bigint_test;

-- 사용자 테이블 생성
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'active',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 프로필 테이블 생성
CREATE TABLE profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  bio TEXT,
  avatar_url VARCHAR(255),
  interests VARCHAR[] DEFAULT '{}',
  updated_at TIMESTAMP
);

-- 게시물 테이블 생성
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  content TEXT,
  tags VARCHAR[] DEFAULT '{}',
  views INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

-- 댓글 테이블 생성
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  user_id INTEGER REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BigInt 테스트 테이블 생성
CREATE TABLE bigint_test (
  id SERIAL PRIMARY KEY,
  small_int BIGINT,
  large_int BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 샘플 데이터 삽입: 사용자
INSERT INTO users (name, email, status, last_login) VALUES
  ('홍길동', 'hong@example.com', 'active', NOW() - INTERVAL '1 day'),
  ('김철수', 'kim@example.com', 'active', NOW() - INTERVAL '3 day'),
  ('이영희', 'lee@example.com', 'inactive', NOW() - INTERVAL '10 day'),
  ('박지민', 'park@example.com', 'active', NOW() - INTERVAL '5 hour'),
  ('최민수', 'choi@example.com', 'active', NOW());

-- 샘플 데이터 삽입: 프로필
INSERT INTO profiles (user_id, bio, avatar_url, interests) VALUES
  (1, '안녕하세요, 홍길동입니다.', 'https://example.com/avatar1.jpg', ARRAY['여행', '독서', '영화']),
  (2, '프로그래머 김철수입니다.', 'https://example.com/avatar2.jpg', ARRAY['코딩', '게임']),
  (3, '디자이너 이영희입니다.', 'https://example.com/avatar3.jpg', ARRAY['디자인', '그림', '음악']),
  (4, '학생 박지민입니다.', 'https://example.com/avatar4.jpg', ARRAY['공부', '독서']),
  (5, '요리사 최민수입니다.', 'https://example.com/avatar5.jpg', ARRAY['요리', '여행']);

-- 샘플 데이터 삽입: 게시물
INSERT INTO posts (user_id, title, content, tags, views) VALUES
  (1, '첫 번째 게시물', '안녕하세요, 첫 번째 게시물입니다.', ARRAY['인사', '소개'], 15),
  (1, '여행 후기', '지난 주말 여행 다녀왔습니다.', ARRAY['여행', '후기'], 32),
  (2, '프로그래밍 팁', '효율적인 코딩을 위한 팁을 공유합니다.', ARRAY['프로그래밍', '팁'], 45),
  (3, '디자인 포트폴리오', '최근 작업한 디자인 포트폴리오입니다.', ARRAY['디자인', '포트폴리오'], 28),
  (4, '공부 방법', '효과적인 공부 방법을 공유합니다.', ARRAY['공부', '팁'], 19),
  (5, '맛있는 레시피', '간단하게 만들 수 있는 레시피를 공유합니다.', ARRAY['요리', '레시피'], 37),
  (2, '두 번째 프로그래밍 팁', '더 많은 프로그래밍 팁을 공유합니다.', ARRAY['프로그래밍', '팁'], 22);

-- 샘플 데이터 삽입: 댓글
INSERT INTO comments (post_id, user_id, content) VALUES
  (1, 2, '환영합니다!'),
  (1, 3, '반갑습니다~'),
  (2, 4, '어디로 여행 다녀오셨나요?'),
  (2, 5, '사진도 공유해주세요!'),
  (3, 1, '유용한 정보 감사합니다.'),
  (4, 2, '멋진 디자인이네요!'),
  (5, 3, '공부 팁 감사합니다.'),
  (6, 1, '레시피 따라 해볼게요!');

-- 샘플 데이터 삽입: BigInt 테스트
INSERT INTO bigint_test (small_int, large_int) VALUES
  (123, 9223372036854775807),
  (456, 9223372036854775806),
  (789, 9223372036854775805);

-- View 생성: 사용자와 게시물 정보를 결합한 뷰
CREATE VIEW user_posts_view AS
SELECT 
  u.id AS user_id,
  u.name AS user_name,
  p.id AS post_id,
  p.title AS post_title,
  p.content AS post_content,
  p.created_at AS post_created_at
FROM 
  users u
JOIN 
  posts p ON u.id = p.user_id
ORDER BY 
  p.created_at DESC;

-- View 생성: 활성 사용자와 게시물 수를 보여주는 뷰
CREATE VIEW active_users_view AS
SELECT 
  u.id,
  u.name,
  u.email,
  u.last_login,
  COUNT(p.id) AS post_count
FROM 
  users u
LEFT JOIN 
  posts p ON u.id = p.user_id
WHERE 
  u.status = 'active'
GROUP BY 
  u.id, u.name, u.email, u.last_login
ORDER BY 
  post_count DESC;
