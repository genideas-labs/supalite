import { config } from 'dotenv';
import { supalitePg } from '../dist';

// .env 파일 로드
config();

async function test() {
  try {
    console.log('환경 변수 확인:');
    console.log('DB_USER:', process.env.DB_USER);
    console.log('DB_HOST:', process.env.DB_HOST);
    console.log('DB_NAME:', process.env.DB_NAME);
    console.log('DB_PORT:', process.env.DB_PORT);
    console.log('DB_SSL:', process.env.DB_SSL);

    // 사용자 목록 조회
    console.log('\n사용자 목록 조회:');
    const result = await supalitePg
      .from('users')
      .select('*')
      .limit(5);
    
    if (result.error) {
      console.error('Error:', result.error);
      return;
    }

    console.log('Users:', result.data);
    console.log('Count:', result.count);
    console.log('Status:', result.status);

    // 특정 사용자의 프로필 조회
    console.log('\n프로필 조회:');
    const userProfile = await supalitePg
      .from('profiles')
      .select('*')
      .eq('user_id', 1)
      .single();

    if (userProfile.error) {
      console.error('Error:', userProfile.error);
      return;
    }

    console.log('Profile:', userProfile.data);

  } catch (err) {
    console.error('Unexpected error:', err);
  } finally {
    // 연결 종료
    await supalitePg.close();
  }
}

test();
