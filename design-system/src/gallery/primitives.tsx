import * as React from "react"
import {
  IconArrowLeft,
  IconBookmark,
  IconInbox,
  IconInfoCircle,
  IconSend2,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Demo, Section } from "./showcase"

function Primitives() {
  const [otp, setOtp] = React.useState("")
  return (
    <div className="flex flex-col gap-14">
      <Section
        id="actions"
        title="الأفعال"
        description="مكوّنات shadcn/ui بعد ضبطها على هوية رفيق. لا تغيّر ألوانها بـ className؛ استعمل المتغيّرات الجاهزة."
      >
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="Button"
            description="حبّة دواء كاملة. البنفسجي للفعل الأساسي، والكهرماني (celebrate) لفعل الاحتفال وحده."
            rules={[
              "فعل أساسي واحد في الشاشة",
              "النص فعلٌ يصف النتيجة: «تابع إلى درس الصلاة» لا «موافق»",
              "لا isLoading: اجمع Spinner مع disabled",
            ]}
            code={`import { Button } from "@/components/ui/button"

<Button>تابع</Button>
<Button variant="secondary">لاحقًا</Button>
<Button variant="outline">شارك</Button>
<Button variant="ghost">تخطَّ</Button>
<Button variant="celebrate">تابع إلى درس الصلاة</Button>
<Button disabled><Spinner data-icon="inline-start" /> جارٍ الإرسال</Button>`}
          >
            <Button>
              تابع
              <IconArrowLeft data-icon="inline-end" className="ltr:rotate-180" />
            </Button>
            <Button variant="secondary">لاحقًا</Button>
            <Button variant="outline">شارك</Button>
            <Button variant="ghost">تخطَّ</Button>
            <Button variant="celebrate">تابع إلى درس الصلاة</Button>
            <Button variant="destructive">
              <IconTrash data-icon="inline-start" />
              احذف بياناتي
            </Button>
            <Button disabled>
              <Spinner data-icon="inline-start" />
              جارٍ الإرسال
            </Button>
            <div className="flex w-full flex-wrap items-center gap-3">
              <Button size="xs">xs</Button>
              <Button size="sm">sm</Button>
              <Button>default · 44</Button>
              <Button size="lg">lg · 52</Button>
              <Button size="icon" aria-label="أرسل">
                <IconSend2 className="rtl:-scale-x-100" />
              </Button>
            </div>
          </Demo>

          <Demo
            name="Badge · Tooltip · Avatar"
            description="الشارة حالة قصيرة. الكهرمانية للاحتفال فقط. الأرقام لاتينية."
            code={`<Badge variant="celebrate">وسام الوضوء</Badge>
<Badge variant="success">تم الرد</Badge>
<Avatar><AvatarFallback>ي</AvatarFallback></Avatar>`}
          >
            <Badge>جديد</Badge>
            <Badge variant="secondary">الدرس 3 من 5</Badge>
            <Badge variant="celebrate">وسام الوضوء</Badge>
            <Badge variant="success">تم الرد</Badge>
            <Badge variant="warning">بانتظار ردك</Badge>
            <Badge variant="destructive">عاجل</Badge>
            <Badge variant="outline">خاص بك</Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label="احفظ">
                  <IconBookmark />
                </Button>
              </TooltipTrigger>
              <TooltipContent>احفظ للرجوع إليها</TooltipContent>
            </Tooltip>
            <Avatar size="lg">
              <AvatarFallback>ي</AvatarFallback>
            </Avatar>
          </Demo>
        </div>
      </Section>

      <Section id="forms" title="الحقول والنماذج" description="النماذج تُبنى بـ FieldGroup وField. الخطأ يوضع على Field بـ data-invalid وعلى الحقل بـ aria-invalid، ورسالته تقول ما حدث وكيف يُصلح.">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="Field · Input · Textarea"
            domain="PLT-02"
            description="الحساب اختياري، وكل حقوله قابلة للتوليد. لا نطلب البريد إلا لمن أراد التحقق بخطوتين."
            code={`<FieldGroup>
  <Field>
    <FieldLabel htmlFor="display">الاسم المعروض</FieldLabel>
    <Input id="display" />
    <FieldDescription>يظهر في لوحة الترتيب والمجموعات فقط.</FieldDescription>
  </Field>
  <Field data-invalid>
    <FieldLabel htmlFor="user">اسم المستخدم</FieldLabel>
    <Input id="user" aria-invalid />
    <FieldError>هذا الاسم مستخدم. جرّب اسمًا آخر أو ولّد اسمًا.</FieldError>
  </Field>
</FieldGroup>`}
            previewClassName="block"
          >
            <FieldGroup className="max-w-md">
              <Field>
                <FieldLabel htmlFor="d-display">الاسم المعروض</FieldLabel>
                <Input id="d-display" defaultValue="نجمة الصباح" />
                <FieldDescription>يظهر في لوحة الترتيب والمجموعات فقط.</FieldDescription>
              </Field>
              <Field data-invalid>
                <FieldLabel htmlFor="d-user">اسم المستخدم</FieldLabel>
                <Input id="d-user" aria-invalid defaultValue="yusuf" dir="ltr" />
                <FieldError>هذا الاسم مستخدم. جرّب اسمًا آخر أو ولّد اسمًا.</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="d-note">سؤالك لمرشدك</FieldLabel>
                <Textarea id="d-note" placeholder="اكتب سؤالك هنا، ولن يراه غير مرشدك" />
              </Field>
            </FieldGroup>
          </Demo>

          <Demo
            name="Select · RadioGroup · Checkbox · Switch · ToggleGroup · InputOTP"
            description="الخيارات من 2 إلى 7 تُعرض ToggleGroup أو RadioGroup، وما زاد فـ Select."
            code={`<ToggleGroup type="single" variant="outline" defaultValue="ar">
  <ToggleGroupItem value="ar">العربية</ToggleGroupItem>
  <ToggleGroupItem value="en">English</ToggleGroupItem>
</ToggleGroup>
<Field orientation="horizontal">
  <Switch id="lb" />
  <FieldLabel htmlFor="lb">أظهرني في لوحة الترتيب</FieldLabel>
</Field>`}
            previewClassName="block"
          >
            <FieldGroup className="max-w-md">
              <Field>
                <FieldLabel>طريقة حساب المواقيت</FieldLabel>
                <Select defaultValue="umm">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="umm">أم القرى</SelectItem>
                      <SelectItem value="mwl">رابطة العالم الإسلامي</SelectItem>
                      <SelectItem value="isna">أمريكا الشمالية</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <ToggleGroup type="single" variant="outline" defaultValue="daily" aria-label="وقت التذكير">
                <ToggleGroupItem value="daily">يوميًا</ToggleGroupItem>
                <ToggleGroupItem value="weekly">أسبوعيًا</ToggleGroupItem>
                <ToggleGroupItem value="off">بلا تذكير</ToggleGroupItem>
              </ToggleGroup>
              <RadioGroup defaultValue="male" className="flex gap-6">
                <Field orientation="horizontal">
                  <RadioGroupItem value="male" id="g-m" />
                  <FieldLabel htmlFor="g-m">مرشد</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="female" id="g-f" />
                  <FieldLabel htmlFor="g-f">مرشدة</FieldLabel>
                </Field>
              </RadioGroup>
              <Field orientation="horizontal">
                <Checkbox id="neutral" defaultChecked />
                <FieldLabel htmlFor="neutral">إشعارات بنص محايد</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Switch id="lb" />
                <FieldLabel htmlFor="lb">أظهرني في لوحة الترتيب</FieldLabel>
              </Field>
              <Field>
                <FieldLabel>رمز التحقق المرسل إلى بريدك</FieldLabel>
                <div dir="ltr" className="w-fit">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </Field>
            </FieldGroup>
          </Demo>
        </div>
      </Section>

      <Section id="feedback" title="الإفادة والحالات" description="لا يُترك المستخدم أكثر من ثانية بلا إشارة. كل قائمة لها حالة فارغة، وكل خطأ له طريق للخروج.">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Demo
            name="Alert"
            description="تنبيه داخل الصفحة. الخطأ: ما حدث، ولماذا، وماذا يفعل المستخدم."
            code={`<Alert variant="warning">
  <IconInfoCircle />
  <AlertTitle>لم نتمكن من حفظ تقدّمك</AlertTitle>
  <AlertDescription>انقطع الاتصال. سنحفظه تلقائيًا حين يعود.</AlertDescription>
</Alert>`}
            stack
          >
            <Alert variant="info">
              <IconInfoCircle />
              <AlertTitle>تقدّمك محفوظ على هذا الجهاز</AlertTitle>
              <AlertDescription>أنشئ حسابًا إن أردت أن تكمل من جهاز آخر.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <IconInfoCircle />
              <AlertTitle>لم نتمكن من حفظ تقدّمك</AlertTitle>
              <AlertDescription>انقطع الاتصال. سنحفظه تلقائيًا حين يعود.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <IconInfoCircle />
              <AlertTitle>وصل سؤالك إلى مرشدك</AlertTitle>
              <AlertDescription>يرد عادةً خلال يوم. سننبهك بنص محايد.</AlertDescription>
            </Alert>
          </Demo>

          <Demo
            name="Progress · Skeleton · Spinner · Toast"
            description="Progress يملأ من بداية السطر في الاتجاهين. Skeleton للتحميل، وToast لتأكيد قصير."
            code={`<Progress value={60} aria-label="تقدّم الدرس" />
<Skeleton className="h-4 w-40" />
toast("حُفظت البطاقة")`}
            stack
          >
            <Progress value={60} aria-label="تقدّم الدرس" />
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Spinner />
              <span className="text-label text-muted-foreground">رفيق يبحث في المصادر…</span>
            </div>
            <Button variant="outline" onClick={() => toast("حُفظت البطاقة", { description: "تجدها في محفوظاتك." })}>
              اعرض إشعارًا
            </Button>
          </Demo>

          <Demo
            name="Empty"
            description="الحالة الفارغة: ما هذا، ولماذا هو فارغ، وكيف تبدأ."
            code={`<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><IconInbox /></EmptyMedia>
    <EmptyTitle>لا أسئلة محفوظة بعد</EmptyTitle>
    <EmptyDescription>احفظ أي إجابة لتعود إليها هنا.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent><Button>اسأل رفيق</Button></EmptyContent>
</Empty>`}
          >
            <Empty className="w-full border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconInbox />
                </EmptyMedia>
                <EmptyTitle>لا أسئلة محفوظة بعد</EmptyTitle>
                <EmptyDescription>احفظ أي إجابة لتعود إليها هنا.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button>اسأل رفيق</Button>
              </EmptyContent>
            </Empty>
          </Demo>

          <Demo
            name="Card · Tabs · Accordion"
            description="البطاقة بتركيبها الكامل: رأس وعنوان ووصف ومحتوى وتذييل."
            code={`<Card>
  <CardHeader>
    <CardTitle>الصلاة</CardTitle>
    <CardDescription>الوحدة الثانية · 6 دروس</CardDescription>
  </CardHeader>
  <CardContent>…</CardContent>
  <CardFooter><Button className="w-full">ابدأ</Button></CardFooter>
</Card>`}
            stack
          >
            <Card>
              <CardHeader>
                <CardTitle>الصلاة</CardTitle>
                <CardDescription>الوحدة الثانية · 6 دروس</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="lessons">
                  <TabsList>
                    <TabsTrigger value="lessons">الدروس</TabsTrigger>
                    <TabsTrigger value="review">المراجعة</TabsTrigger>
                  </TabsList>
                  <TabsContent value="lessons" className="pt-3 text-label text-muted-foreground">
                    أوقات الصلاة، والطهارة لها، وكيف تصلي ركعتين.
                  </TabsContent>
                  <TabsContent value="review" className="pt-3 text-label text-muted-foreground">
                    3 تمارين تنتظر المراجعة.
                  </TabsContent>
                </Tabs>
              </CardContent>
              <CardFooter>
                <Button className="w-full">ابدأ</Button>
              </CardFooter>
            </Card>
            <Accordion type="single" collapsible className="rounded-card border bg-card px-4">
              <AccordionItem value="a">
                <AccordionTrigger>هل يجب أن أتعلم العربية لأصلي؟</AccordionTrigger>
                <AccordionContent>إجابة قصيرة بمصدرها، تُعرض من المصادر المعتمدة.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="b">
                <AccordionTrigger>متى أخبر أسرتي؟</AccordionTrigger>
                <AccordionContent>هذه مسألة شخصية؛ يساعدك فيها مرشدك.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </Demo>
        </div>
      </Section>

      <Section id="overlays" title="النوافذ" description="الصفحة السفلية (Drawer) هي الأصل على الجوال. كل نافذة لها عنوان، ولو مخفيًا.">
        <Demo
          name="Drawer · AlertDialog"
          description="الحذف يُؤكَّد بوصف عاقبته، وزرّاه يحملان الفعل: «احذف بياناتي» و«أبقِها»."
          code={`<AlertDialog>
  <AlertDialogTrigger asChild><Button variant="destructive">احذف بياناتي</Button></AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>تحذف تقدّمك وأسئلتك كلها؟</AlertDialogTitle>
      <AlertDialogDescription>لا يمكن التراجع عن هذا.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>أبقِها</AlertDialogCancel>
      <AlertDialogAction>احذف بياناتي</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>`}
        >
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline">افتح صفحة سفلية</Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="mx-auto w-full max-w-md">
                <DrawerHeader>
                  <DrawerTitle>اختر وقت التذكير</DrawerTitle>
                  <DrawerDescription>مرة في اليوم على الأكثر، وبنص محايد.</DrawerDescription>
                </DrawerHeader>
                <DrawerFooter>
                  <Button>احفظ</Button>
                  <DrawerClose asChild>
                    <Button variant="outline">إلغاء</Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">احذف بياناتي</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تحذف تقدّمك وأسئلتك كلها؟</AlertDialogTitle>
                <AlertDialogDescription>لا يمكن التراجع عن هذا.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>أبقِها</AlertDialogCancel>
                <AlertDialogAction variant="destructive">احذف بياناتي</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Demo>
      </Section>
    </div>
  )
}

export { Primitives }
