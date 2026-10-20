import { AppPage } from '@/components/page';
import { EmptyStudy } from '@/components/empty-study';

export default function TodayPage() {
  return (
    <AppPage current="today" title="Today">
      <EmptyStudy />
    </AppPage>
  );
}
