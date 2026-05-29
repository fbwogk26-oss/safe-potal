import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import EducationManagement from "./EducationManagement";
import EducationStatus from "./EducationStatus";
import OnlineEduProgress from "./OnlineEduProgress";

export default function EducationTasksPage() {
  return (
    <Tabs defaultValue="management" className="space-y-4">
      <TabsList className="h-10">
        <TabsTrigger value="management" className="text-sm px-5" data-testid="tab-management">
          교육업무 관리
        </TabsTrigger>
        <TabsTrigger value="status" className="text-sm px-5" data-testid="tab-status">
          교육업무 현황
        </TabsTrigger>
        <TabsTrigger value="online-progress" className="text-sm px-5" data-testid="tab-online-progress">
          온라인교육 진도현황
        </TabsTrigger>
      </TabsList>
      <TabsContent value="management" className="mt-0">
        <EducationManagement />
      </TabsContent>
      <TabsContent value="status" className="mt-0">
        <EducationStatus />
      </TabsContent>
      <TabsContent value="online-progress" className="mt-0">
        <OnlineEduProgress />
      </TabsContent>
    </Tabs>
  );
}
